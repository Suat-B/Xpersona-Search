"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyRunCommandKind = classifyRunCommandKind;
exports.isVerificationReceipt = isVerificationReceipt;
exports.hasSuccessfulWorkspaceMutation = hasSuccessfulWorkspaceMutation;
exports.hasSuccessfulVerification = hasSuccessfulVerification;
exports.hasCodeChangeCompletionProof = hasCodeChangeCompletionProof;
exports.requiresCodeChangeMutation = requiresCodeChangeMutation;
exports.requiresCodeChangeVerification = requiresCodeChangeVerification;
exports.getPreferredStrategyPhase = getPreferredStrategyPhase;
exports.getProgressConfidence = getProgressConfidence;
exports.hasCompletedInspection = hasCompletedInspection;
exports.resolveRetryStrategy = resolveRetryStrategy;
exports.buildDeadEndSignature = buildDeadEndSignature;
exports.appendDeadEndMemory = appendDeadEndMemory;
exports.deadEndAlreadySeen = deadEndAlreadySeen;
exports.batchNeedsMoreAutonomy = batchNeedsMoreAutonomy;
exports.isVerificationToolCall = isVerificationToolCall;
exports.describeAutonomyGap = describeAutonomyGap;
const MAX_DEAD_END_MEMORY = 8;
const OBSERVE_COMMAND_RE = /\b(rg|ripgrep|grep|findstr|cat|type|more|less|sed|awk|ls|dir|tree|find|get-content|select-string|git\s+status|git\s+diff|git\s+show)\b/i;
const VERIFICATION_COMMAND_RE = /\b(test|tests|typecheck|lint|build|check|compile|validate|verify|pytest|vitest|jest|mocha|ava|tsc|ruff|mypy|cargo\s+test|cargo\s+check|go\s+test|go\s+build|npm\s+run|pnpm\s+run|yarn\s+run|bun\s+run|gradle|mvn|xcodebuild)\b/i;
function stringValue(value) {
    return String(value ?? "").trim();
}
function classifyRunCommandKind(command) {
    const text = stringValue(command);
    if (!text)
        return "other";
    if (VERIFICATION_COMMAND_RE.test(text))
        return "verification";
    if (OBSERVE_COMMAND_RE.test(text))
        return "observe";
    return "other";
}
function isVerificationReceipt(receipt) {
    if (!receipt || receipt.status !== "completed")
        return false;
    if (receipt.toolName === "get_diagnostics")
        return true;
    if (receipt.toolName === "run_command") {
        return classifyRunCommandKind(receipt.data?.command) === "verification";
    }
    return false;
}
function hasSuccessfulWorkspaceMutation(run) {
    return run.receipts.some((receipt) => receipt.status === "completed" &&
        receipt.kind === "mutate" &&
        receipt.toolName !== "create_checkpoint");
}
function hasSuccessfulVerification(run) {
    return run.receipts.some((receipt) => isVerificationReceipt(receipt));
}
function hasCodeChangeCompletionProof(run) {
    if (run.goal !== "code_change")
        return Boolean(run.goalSatisfied);
    return hasSuccessfulWorkspaceMutation(run) && Boolean(stringValue(run.lastVerifiedOutcome) || hasSuccessfulVerification(run));
}
function requiresCodeChangeMutation(run) {
    return run.goal === "code_change" && !hasSuccessfulWorkspaceMutation(run);
}
function requiresCodeChangeVerification(run) {
    return run.goal === "code_change" && hasSuccessfulWorkspaceMutation(run) && !hasCodeChangeCompletionProof(run);
}
function getPreferredStrategyPhase(run) {
    if (run.status === "failed" || run.status === "needs_guidance")
        return "blocked";
    if (run.phase === "repairing") {
        return run.retryStrategy === "fallback_strategy" || run.retryStrategy === "full_rewrite" ? "fallback" : "repair";
    }
    if (requiresCodeChangeVerification(run))
        return "verify";
    if (requiresCodeChangeMutation(run)) {
        return hasCompletedInspection(run) ? "mutate" : "inspect";
    }
    if (hasCodeChangeCompletionProof(run))
        return "verify";
    return run.goal === "workspace_investigation" ? "inspect" : "mutate";
}
function getProgressConfidence(run) {
    if (hasCodeChangeCompletionProof(run))
        return "high";
    if (hasSuccessfulWorkspaceMutation(run) || hasSuccessfulVerification(run))
        return "medium";
    return "low";
}
function hasCompletedInspection(run) {
    return run.receipts.some((receipt) => receipt.status === "completed" &&
        (receipt.toolName === "read_file" ||
            receipt.toolName === "list_files" ||
            receipt.toolName === "search_workspace" ||
            receipt.toolName === "get_diagnostics" ||
            receipt.toolName === "git_status" ||
            receipt.toolName === "git_diff"));
}
function resolveRetryStrategy(input) {
    const priorRepairs = Math.max(0, input.run.repairAttemptCount);
    switch (input.reason) {
        case "missing_mutation":
            if (priorRepairs === 0)
                return "force_mutation";
            if (priorRepairs === 1)
                return "alternate_mutation";
            if (priorRepairs === 2)
                return "command_repair";
            return "full_rewrite";
        case "stale_revision":
            return "refresh_state";
        case "mutation_failure":
            if (priorRepairs === 0)
                return "alternate_mutation";
            if (priorRepairs === 1)
                return "full_rewrite";
            return "command_repair";
        case "verification_failure":
            return priorRepairs === 0 ? "verification_repair" : "fallback_strategy";
        case "repeat_identical":
            if (requiresCodeChangeMutation(input.run))
                return "force_mutation";
            if (requiresCodeChangeVerification(input.run))
                return "verification_repair";
            return "fallback_strategy";
        case "generic_failure":
        default:
            return "fallback_strategy";
    }
}
function buildDeadEndSignature(input) {
    const toolName = stringValue(input.toolCall?.name || input.receipt?.toolName || "none");
    const args = input.toolCall?.arguments ? JSON.stringify(input.toolCall.arguments) : "";
    const command = toolName === "run_command" ? stringValue(input.receipt?.data?.command || input.toolCall?.arguments?.command) : "";
    const error = stringValue(input.receipt?.error || input.note || input.receipt?.summary);
    return [toolName, args, command, error].filter(Boolean).join(" :: ").slice(0, 420);
}
function appendDeadEndMemory(existing, signature) {
    const current = Array.isArray(existing) ? existing.filter(Boolean).slice(-MAX_DEAD_END_MEMORY) : [];
    const normalized = stringValue(signature);
    if (!normalized)
        return current;
    if (current[current.length - 1] === normalized)
        return current;
    const next = [...current, normalized];
    return next.slice(-MAX_DEAD_END_MEMORY);
}
function deadEndAlreadySeen(existing, signature) {
    const normalized = stringValue(signature);
    if (!normalized)
        return false;
    return Array.isArray(existing) ? existing.includes(normalized) : false;
}
function batchNeedsMoreAutonomy(input) {
    if (input.goal !== "code_change" || !input.batch.length)
        return "ok";
    const includesMutation = input.batch.some((tool) => isMutationToolName(tool.name));
    const includesVerification = input.batch.some((tool) => isVerificationToolCall(tool));
    if (requiresCodeChangeMutation(input.run)) {
        if (!includesMutation)
            return "missing_mutation";
        return "ok";
    }
    if (requiresCodeChangeVerification(input.run)) {
        if (!includesMutation && !includesVerification)
            return "missing_verification";
    }
    return "ok";
}
function isVerificationToolCall(toolCall) {
    if (toolCall.name === "get_diagnostics")
        return true;
    if (toolCall.name === "run_command") {
        return classifyRunCommandKind(toolCall.arguments?.command) === "verification";
    }
    return false;
}
function describeAutonomyGap(run) {
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
function isMutationToolName(name) {
    return name === "patch_file" || name === "write_file" || name === "mkdir" || name === "edit_file";
}
//# sourceMappingURL=cutie-autonomy-controller.js.map