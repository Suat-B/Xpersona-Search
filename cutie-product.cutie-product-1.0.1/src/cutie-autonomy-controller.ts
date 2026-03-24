import type {
  CutieProgressConfidence,
  CutieRepairTactic,
  CutieRetryStrategy,
  CutieRunState,
  CutieStallLevel,
  CutieStrategyPhase,
  CutieTaskGoal,
  CutieToolCall,
  CutieToolReceipt,
} from "./types";
import { normalizeWorkspaceRelativePath } from "./cutie-policy";

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

function normalizeReceiptPath(receipt: CutieToolReceipt | null | undefined): string | null {
  return normalizeWorkspaceRelativePath(
    receipt?.data && typeof receipt.data.path === "string" ? String(receipt.data.path) : null
  );
}

function normalizeToolPath(toolCall: Pick<CutieToolCall, "arguments"> | null | undefined): string | null {
  return normalizeWorkspaceRelativePath(
    toolCall?.arguments && typeof toolCall.arguments.path === "string" ? String(toolCall.arguments.path) : null
  );
}

function isPreferredTargetInspectionBatch(
  run: CutieRunState,
  batch: Array<Pick<CutieToolCall, "name" | "arguments">>
): boolean {
  const preferred = normalizeWorkspaceRelativePath(run.preferredTargetPath || null);
  if (!preferred) return false;
  if (run.targetAcquisitionPhase !== "target_inspection" && run.currentRepairTactic !== "read_target") return false;
  return batch.some((tool) => tool.name === "read_file" && normalizeToolPath(tool) === preferred);
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

export function hasCompletedTargetInspection(run: CutieRunState): boolean {
  const preferred = normalizeWorkspaceRelativePath(run.preferredTargetPath || null);
  if (!preferred) return false;
  return run.receipts.some(
    (receipt) =>
      receipt.status === "completed" && receipt.toolName === "read_file" && normalizeReceiptPath(receipt) === preferred
  );
}

export function hasCodeChangeCompletionProof(run: CutieRunState): boolean {
  if (run.goal !== "code_change") return false;
  if (stringValue(run.noOpConclusion)) {
    return Boolean(stringValue(run.lastVerifiedOutcome) || hasSuccessfulVerification(run));
  }
  return hasSuccessfulWorkspaceMutation(run) && Boolean(stringValue(run.lastVerifiedOutcome) || hasSuccessfulVerification(run));
}

export function requiresCodeChangeMutation(run: CutieRunState): boolean {
  return run.goal === "code_change" && !hasSuccessfulWorkspaceMutation(run) && !stringValue(run.noOpConclusion);
}

export function requiresCodeChangeVerification(run: CutieRunState): boolean {
  return run.goal === "code_change" && hasSuccessfulWorkspaceMutation(run) && !hasCodeChangeCompletionProof(run);
}

export function getPreferredStrategyPhase(run: CutieRunState): CutieStrategyPhase {
  if (run.goal === "conversation") return run.status === "failed" || run.status === "needs_guidance" ? "blocked" : "inspect";
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
  if (run.goal === "conversation") return run.goalSatisfied ? "medium" : "low";
  if (hasCodeChangeCompletionProof(run)) return "high";
  if (stringValue(run.lastNewEvidence)) return "medium";
  if (hasSuccessfulWorkspaceMutation(run) || hasSuccessfulVerification(run) || hasCompletedTargetInspection(run)) {
    return "medium";
  }
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

function getRepairTacticLabel(tactic: CutieRepairTactic | undefined): string {
  switch (tactic) {
    case "infer_target":
      return "Inferring the target file";
    case "read_target":
      return "Inspecting the target file";
    case "semantic_search":
      return "Searching for the requested construct";
    case "example_search":
      return "Looking for nearby examples";
    case "command_assisted_repair":
      return "Using command-assisted semantic recovery";
    case "patch_mutation":
      return "Applying a targeted patch";
    case "full_rewrite":
      return "Preparing a full-file rewrite";
    case "verification":
      return "Verifying the latest evidence";
    default:
      return "";
  }
}

export function getCurrentStrategyLabel(run: CutieRunState): string {
  if (run.goal === "conversation") return "";
  const tacticLabel = getRepairTacticLabel(run.currentRepairTactic);
  if (tacticLabel) return tacticLabel;
  switch (run.retryStrategy) {
    case "force_mutation":
      return "Forcing a direct edit strategy";
    case "alternate_mutation":
      return "Trying an alternate edit strategy";
    case "full_rewrite":
      return "Escalating to a full-file rewrite";
    case "command_repair":
      return "Using a command-assisted repair strategy";
    case "verification_repair":
      return "Switching to targeted verification";
    case "refresh_state":
      return "Refreshing file state before retrying";
    case "fallback_strategy":
      return "Escalating to a fallback recovery strategy";
    case "none":
    default:
      switch (run.strategyPhase) {
        case "inspect":
          return "Inspecting the target";
        case "mutate":
          return "Applying a concrete edit";
        case "verify":
          return "Verifying the latest result";
        case "repair":
          return "Repairing the current approach";
        case "fallback":
          return "Escalating the recovery approach";
        case "blocked":
          return "Blocked on the current approach";
        default:
          return "Continuing the current strategy";
      }
  }
}

export function getStallLevel(noProgressTurns: number | undefined): CutieStallLevel {
  const turns = Math.max(0, Number(noProgressTurns || 0));
  if (turns >= 4) return "severe";
  if (turns >= 2) return "warning";
  return "none";
}

export function getStallLabel(run: CutieRunState): string | undefined {
  if (!run.stallLevel || run.stallLevel === "none") return undefined;
  const sinceStep =
    typeof run.stallSinceStep === "number" && run.stallSinceStep > 0 ? ` since step ${run.stallSinceStep}` : "";
  if (run.stallLevel === "severe") return `Severely stalled${sinceStep}`;
  return `Stalled${sinceStep}`;
}

export function isMeaningfulProgressReceipt(goal: CutieTaskGoal, run: CutieRunState, receipt: CutieToolReceipt): boolean {
  if (receipt.status !== "completed") return false;
  switch (goal) {
    case "code_change": {
      if (receipt.toolName === "read_file") {
        const preferred = normalizeWorkspaceRelativePath(run.preferredTargetPath || null);
        const path = normalizeReceiptPath(receipt);
        if (preferred && path && preferred === path && !hasCompletedTargetInspection(run)) return true;
        return Boolean(run.currentRepairTactic === "read_target" && path && !hasCompletedInspection(run));
      }
      if (
        receipt.toolName === "patch_file" ||
        receipt.toolName === "write_file" ||
        receipt.toolName === "mkdir"
      ) {
        return true;
      }
      if (
        receipt.toolName === "search_workspace" &&
        (run.currentRepairTactic === "semantic_search" || run.currentRepairTactic === "example_search")
      ) {
        return true;
      }
      if (isVerificationReceipt(receipt)) return true;
      if (receipt.toolName === "run_command") {
        return (
          run.retryStrategy === "command_repair" ||
          run.retryStrategy === "refresh_state" ||
          run.currentRepairTactic === "command_assisted_repair" ||
          run.currentRepairTactic === "verification"
        );
      }
      return false;
    }
    case "workspace_investigation":
      return receipt.domain === "workspace";
    case "desktop_action":
      return receipt.domain === "desktop";
    case "conversation":
    default:
      return false;
  }
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
  const semanticRecoveryActive =
    input.run.targetAcquisitionPhase === "target_acquisition" ||
    input.run.targetAcquisitionPhase === "semantic_recovery" ||
    input.run.currentRepairTactic === "infer_target" ||
    input.run.currentRepairTactic === "semantic_search" ||
    input.run.currentRepairTactic === "example_search" ||
    input.run.currentRepairTactic === "command_assisted_repair";
  if (requiresCodeChangeMutation(input.run)) {
    if (!hasCompletedTargetInspection(input.run) && isPreferredTargetInspectionBatch(input.run, input.batch)) {
      return "ok";
    }
    if (semanticRecoveryActive) return "ok";
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
  if (stringValue(run.noOpConclusion)) {
    return run.noOpConclusion as string;
  }
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
