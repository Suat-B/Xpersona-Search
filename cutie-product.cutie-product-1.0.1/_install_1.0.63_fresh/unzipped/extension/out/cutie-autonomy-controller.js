"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyRunCommandKind = classifyRunCommandKind;
exports.isVerificationReceipt = isVerificationReceipt;
exports.hasSuccessfulWorkspaceMutation = hasSuccessfulWorkspaceMutation;
exports.hasSuccessfulVerification = hasSuccessfulVerification;
exports.hasCompletedTargetInspection = hasCompletedTargetInspection;
exports.hasCodeChangeCompletionProof = hasCodeChangeCompletionProof;
exports.requiresCodeChangeMutation = requiresCodeChangeMutation;
exports.requiresCodeChangeVerification = requiresCodeChangeVerification;
exports.getPreferredStrategyPhase = getPreferredStrategyPhase;
exports.getProgressConfidence = getProgressConfidence;
exports.hasCompletedInspection = hasCompletedInspection;
exports.getCurrentStrategyLabel = getCurrentStrategyLabel;
exports.getStallLevel = getStallLevel;
exports.getStallLabel = getStallLabel;
exports.isMeaningfulProgressReceipt = isMeaningfulProgressReceipt;
exports.resolveRetryStrategy = resolveRetryStrategy;
exports.buildDeadEndSignature = buildDeadEndSignature;
exports.appendDeadEndMemory = appendDeadEndMemory;
exports.deadEndAlreadySeen = deadEndAlreadySeen;
exports.batchNeedsMoreAutonomy = batchNeedsMoreAutonomy;
exports.isVerificationToolCall = isVerificationToolCall;
exports.describeAutonomyGap = describeAutonomyGap;
const cutie_policy_1 = require("./cutie-policy");
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
function normalizeReceiptPath(receipt) {
    return (0, cutie_policy_1.normalizeWorkspaceRelativePath)(receipt?.data && typeof receipt.data.path === "string" ? String(receipt.data.path) : null);
}
function hasSuccessfulWorkspaceMutation(run) {
    return run.receipts.some((receipt) => receipt.status === "completed" &&
        receipt.kind === "mutate" &&
        receipt.toolName !== "create_checkpoint");
}
function hasSuccessfulVerification(run) {
    return run.receipts.some((receipt) => isVerificationReceipt(receipt));
}
function hasCompletedTargetInspection(run) {
    const preferred = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(run.preferredTargetPath || null);
    if (!preferred)
        return false;
    return run.receipts.some((receipt) => receipt.status === "completed" && receipt.toolName === "read_file" && normalizeReceiptPath(receipt) === preferred);
}
function hasCodeChangeCompletionProof(run) {
    if (run.goal !== "code_change")
        return false;
    if (stringValue(run.noOpConclusion)) {
        return Boolean(stringValue(run.lastVerifiedOutcome) || hasSuccessfulVerification(run));
    }
    return hasSuccessfulWorkspaceMutation(run) && Boolean(stringValue(run.lastVerifiedOutcome) || hasSuccessfulVerification(run));
}
function requiresCodeChangeMutation(run) {
    return run.goal === "code_change" && !hasSuccessfulWorkspaceMutation(run) && !stringValue(run.noOpConclusion);
}
function requiresCodeChangeVerification(run) {
    return run.goal === "code_change" && hasSuccessfulWorkspaceMutation(run) && !hasCodeChangeCompletionProof(run);
}
function getPreferredStrategyPhase(run) {
    if (run.goal === "conversation")
        return run.status === "failed" || run.status === "needs_guidance" ? "blocked" : "inspect";
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
    if (run.goal === "conversation")
        return run.goalSatisfied ? "medium" : "low";
    if (hasCodeChangeCompletionProof(run))
        return "high";
    if (stringValue(run.lastNewEvidence))
        return "medium";
    if (hasSuccessfulWorkspaceMutation(run) || hasSuccessfulVerification(run) || hasCompletedTargetInspection(run)) {
        return "medium";
    }
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
function getRepairTacticLabel(tactic) {
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
function getCurrentStrategyLabel(run) {
    if (run.goal === "conversation")
        return "";
    const tacticLabel = getRepairTacticLabel(run.currentRepairTactic);
    if (tacticLabel)
        return tacticLabel;
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
function getStallLevel(noProgressTurns) {
    const turns = Math.max(0, Number(noProgressTurns || 0));
    if (turns >= 4)
        return "severe";
    if (turns >= 2)
        return "warning";
    return "none";
}
function getStallLabel(run) {
    if (!run.stallLevel || run.stallLevel === "none")
        return undefined;
    const sinceStep = typeof run.stallSinceStep === "number" && run.stallSinceStep > 0 ? ` since step ${run.stallSinceStep}` : "";
    if (run.stallLevel === "severe")
        return `Severely stalled${sinceStep}`;
    return `Stalled${sinceStep}`;
}
function isMeaningfulProgressReceipt(goal, run, receipt) {
    if (receipt.status !== "completed")
        return false;
    switch (goal) {
        case "code_change": {
            if (receipt.toolName === "read_file") {
                const preferred = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(run.preferredTargetPath || null);
                const path = normalizeReceiptPath(receipt);
                if (preferred && path && preferred === path && !hasCompletedTargetInspection(run))
                    return true;
                return Boolean(run.currentRepairTactic === "read_target" && path && !hasCompletedInspection(run));
            }
            if (receipt.toolName === "patch_file" ||
                receipt.toolName === "write_file" ||
                receipt.toolName === "mkdir") {
                return true;
            }
            if (receipt.toolName === "search_workspace" &&
                (run.currentRepairTactic === "semantic_search" || run.currentRepairTactic === "example_search")) {
                return true;
            }
            if (isVerificationReceipt(receipt))
                return true;
            if (receipt.toolName === "run_command") {
                return (run.retryStrategy === "command_repair" ||
                    run.retryStrategy === "refresh_state" ||
                    run.currentRepairTactic === "command_assisted_repair" ||
                    run.currentRepairTactic === "verification");
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
    const semanticRecoveryActive = input.run.targetAcquisitionPhase === "target_acquisition" ||
        input.run.targetAcquisitionPhase === "semantic_recovery" ||
        input.run.currentRepairTactic === "infer_target" ||
        input.run.currentRepairTactic === "semantic_search" ||
        input.run.currentRepairTactic === "example_search" ||
        input.run.currentRepairTactic === "command_assisted_repair";
    if (requiresCodeChangeMutation(input.run)) {
        if (semanticRecoveryActive)
            return "ok";
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
    if (stringValue(run.noOpConclusion)) {
        return run.noOpConclusion;
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
function isMutationToolName(name) {
    return name === "patch_file" || name === "write_file" || name === "mkdir" || name === "edit_file";
}
//# sourceMappingURL=cutie-autonomy-controller.js.map