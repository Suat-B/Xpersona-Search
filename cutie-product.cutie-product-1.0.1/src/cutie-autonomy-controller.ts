import type {
  CutieProgressConfidence,
  CutieRetryStrategy,
  CutieRunState,
  CutieStrategyPhase,
  CutieTaskGoal,
  CutieToolCall,
  CutieToolReceipt,
} from "./types";

const MAX_DEAD_END_MEMORY = 8;

const OBSERVE_COMMAND_RE =
  /\b(rg|ripgrep|grep|findstr|cat|type|more|less|sed|awk|ls|dir|tree|find|get-content|select-string|git\s+status|git\s+diff|git\s+show)\b/i;
const VERIFICATION_COMMAND_RE =
  /\b(test|tests|typecheck|lint|build|check|compile|validate|verify|pytest|vitest|jest|mocha|ava|tsc|ruff|mypy|cargo\s+test|cargo\s+check|go\s+test|go\s+build|npm\s+run|pnpm\s+run|yarn\s+run|bun\s+run|gradle|mvn|xcodebuild)\b/i;

export type CutieAutonomyRepairReason =
  | "missing_mutation"
  | "mutation_failure"
  | "stale_revision"
  | "verification_failure"
  | "repeat_identical"
  | "generic_failure";

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

export function classifyRunCommandKind(command: unknown): "observe" | "verification" | "other" {
  const text = stringValue(command);
  if (!text) return "other";
  if (VERIFICATION_COMMAND_RE.test(text)) return "verification";
  if (OBSERVE_COMMAND_RE.test(text)) return "observe";
  return "other";
}

export function isVerificationReceipt(receipt: CutieToolReceipt | null | undefined): boolean {
  if (!receipt || receipt.status !== "completed") return false;
  if (receipt.toolName === "get_diagnostics") return true;
  if (receipt.toolName === "run_command") {
    return classifyRunCommandKind(receipt.data?.command) === "verification";
  }
  return false;
}

export function hasSuccessfulWorkspaceMutation(run: CutieRunState): boolean {
  return run.receipts.some(
    (receipt) =>
      receipt.status === "completed" &&
      receipt.kind === "mutate" &&
      receipt.toolName !== "create_checkpoint"
  );
}

export function hasSuccessfulVerification(run: CutieRunState): boolean {
  return run.receipts.some((receipt) => isVerificationReceipt(receipt));
}

export function hasCodeChangeCompletionProof(run: CutieRunState): boolean {
  if (run.goal !== "code_change") return Boolean(run.goalSatisfied);
  return hasSuccessfulWorkspaceMutation(run) && Boolean(stringValue(run.lastVerifiedOutcome) || hasSuccessfulVerification(run));
}

export function requiresCodeChangeMutation(run: CutieRunState): boolean {
  return run.goal === "code_change" && !hasSuccessfulWorkspaceMutation(run);
}

export function requiresCodeChangeVerification(run: CutieRunState): boolean {
  return run.goal === "code_change" && hasSuccessfulWorkspaceMutation(run) && !hasCodeChangeCompletionProof(run);
}

export function getPreferredStrategyPhase(run: CutieRunState): CutieStrategyPhase {
  if (run.status === "failed" || run.status === "needs_guidance") return "blocked";
  if (run.phase === "repairing") {
    return run.retryStrategy === "fallback_strategy" || run.retryStrategy === "full_rewrite" ? "fallback" : "repair";
  }
  if (requiresCodeChangeVerification(run)) return "verify";
  if (requiresCodeChangeMutation(run)) {
    return hasCompletedInspection(run) ? "mutate" : "inspect";
  }
  if (hasCodeChangeCompletionProof(run)) return "verify";
  return run.goal === "workspace_investigation" ? "inspect" : "mutate";
}

export function getProgressConfidence(run: CutieRunState): CutieProgressConfidence {
  if (hasCodeChangeCompletionProof(run)) return "high";
  if (hasSuccessfulWorkspaceMutation(run) || hasSuccessfulVerification(run)) return "medium";
  return "low";
}

export function hasCompletedInspection(run: CutieRunState): boolean {
  return run.receipts.some(
    (receipt) =>
      receipt.status === "completed" &&
      (receipt.toolName === "read_file" ||
        receipt.toolName === "list_files" ||
        receipt.toolName === "search_workspace" ||
        receipt.toolName === "get_diagnostics" ||
        receipt.toolName === "git_status" ||
        receipt.toolName === "git_diff")
  );
}

export function resolveRetryStrategy(input: {
  run: CutieRunState;
  reason: CutieAutonomyRepairReason;
}): CutieRetryStrategy {
  const priorRepairs = Math.max(0, input.run.repairAttemptCount);
  switch (input.reason) {
    case "missing_mutation":
      if (priorRepairs === 0) return "force_mutation";
      if (priorRepairs === 1) return "alternate_mutation";
      if (priorRepairs === 2) return "command_repair";
      return "full_rewrite";
    case "stale_revision":
      return "refresh_state";
    case "mutation_failure":
      if (priorRepairs === 0) return "alternate_mutation";
      if (priorRepairs === 1) return "full_rewrite";
      return "command_repair";
    case "verification_failure":
      return priorRepairs === 0 ? "verification_repair" : "fallback_strategy";
    case "repeat_identical":
      if (requiresCodeChangeMutation(input.run)) return "force_mutation";
      if (requiresCodeChangeVerification(input.run)) return "verification_repair";
      return "fallback_strategy";
    case "generic_failure":
    default:
      return "fallback_strategy";
  }
}

export function buildDeadEndSignature(input: {
  toolCall?: Pick<CutieToolCall, "name" | "arguments"> | null;
  receipt?: Pick<CutieToolReceipt, "toolName" | "status" | "error" | "summary" | "data"> | null;
  note?: string | null;
}): string {
  const toolName = stringValue(input.toolCall?.name || input.receipt?.toolName || "none");
  const args = input.toolCall?.arguments ? JSON.stringify(input.toolCall.arguments) : "";
  const command =
    toolName === "run_command" ? stringValue(input.receipt?.data?.command || input.toolCall?.arguments?.command) : "";
  const error = stringValue(input.receipt?.error || input.note || input.receipt?.summary);
  return [toolName, args, command, error].filter(Boolean).join(" :: ").slice(0, 420);
}

export function appendDeadEndMemory(existing: string[] | undefined, signature: string): string[] {
  const current = Array.isArray(existing) ? existing.filter(Boolean).slice(-MAX_DEAD_END_MEMORY) : [];
  const normalized = stringValue(signature);
  if (!normalized) return current;
  if (current[current.length - 1] === normalized) return current;
  const next = [...current, normalized];
  return next.slice(-MAX_DEAD_END_MEMORY);
}

export function deadEndAlreadySeen(existing: string[] | undefined, signature: string): boolean {
  const normalized = stringValue(signature);
  if (!normalized) return false;
  return Array.isArray(existing) ? existing.includes(normalized) : false;
}

export function batchNeedsMoreAutonomy(input: {
  goal: CutieTaskGoal;
  run: CutieRunState;
  batch: Array<Pick<CutieToolCall, "name" | "arguments">>;
}): "ok" | "missing_mutation" | "missing_verification" {
  if (input.goal !== "code_change" || !input.batch.length) return "ok";
  const includesMutation = input.batch.some((tool) => isMutationToolName(tool.name));
  const includesVerification = input.batch.some((tool) => isVerificationToolCall(tool));
  if (requiresCodeChangeMutation(input.run)) {
    if (!includesMutation) return "missing_mutation";
    return "ok";
  }
  if (requiresCodeChangeVerification(input.run)) {
    if (!includesMutation && !includesVerification) return "missing_verification";
  }
  return "ok";
}

export function isVerificationToolCall(toolCall: Pick<CutieToolCall, "name" | "arguments">): boolean {
  if (toolCall.name === "get_diagnostics") return true;
  if (toolCall.name === "run_command") {
    return classifyRunCommandKind(toolCall.arguments?.command) === "verification";
  }
  return false;
}

export function describeAutonomyGap(run: CutieRunState): string {
  if (requiresCodeChangeMutation(run)) {
    return "Cutie still owes a concrete workspace change.";
  }
  if (requiresCodeChangeVerification(run)) {
    return "Cutie still owes a verification step before it can finish.";
  }
  if (hasCodeChangeCompletionProof(run)) {
    return stringValue(run.lastVerifiedOutcome) || "Cutie has verified the completed workspace change.";
  }
  return "Cutie is still working toward a concrete result.";
}

function isMutationToolName(name: string): boolean {
  return name === "patch_file" || name === "write_file" || name === "mkdir" || name === "edit_file";
}
