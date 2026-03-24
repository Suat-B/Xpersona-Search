"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNLIMITED_DIRECT_MUTATION_REPAIR_CAP = exports.DIRECT_MUTATION_REPAIR_CAP = void 0;
exports.selectCodeChangeAutonomyMode = selectCodeChangeAutonomyMode;
exports.resolveNativeNextToolHints = resolveNativeNextToolHints;
exports.findToolArtifactStart = findToolArtifactStart;
exports.looksLikeCutieToolArtifactText = looksLikeCutieToolArtifactText;
exports.extractVisibleAssistantText = extractVisibleAssistantText;
exports.DIRECT_MUTATION_REPAIR_CAP = 4;
exports.UNLIMITED_DIRECT_MUTATION_REPAIR_CAP = 12;
function stripCodeFence(raw) {
    const trimmed = String(raw || "").trim();
    const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
    return fenceMatch ? fenceMatch[1].trim() : trimmed;
}
function stripMentionTokens(prompt) {
    return String(prompt || "")
        .replace(/@window:"[^"]+"/gi, " ")
        .replace(/@"[^"]+"/g, " ")
        .replace(/@window:[^\s]+/gi, " ")
        .replace(/@[A-Za-z0-9_./:-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function wantsBroadWorkspaceDiscovery(prompt) {
    return /\b(entire|whole|across|all|every|workspace|repo|repository|project|multiple files|many files)\b/i.test(prompt);
}
function wantsCurrentFileInspection(prompt) {
    return /\b(this file|current file|active file|open file|in this file|in the current file|here in this file)\b/i.test(prompt);
}
function referencesActiveEditingContext(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase();
    if (!normalized)
        return false;
    return /\b(here|in here|right here|this code|this script|this strategy)\b/.test(normalized);
}
function hasActionVerb(prompt) {
    return /\b(add|change|edit|update|modify|fix|implement|create|write|rewrite|replace|make|remove|delete|improve|enhance|extend|append|insert)\b/i.test(stripMentionTokens(prompt));
}
function selectCodeChangeAutonomyMode(input) {
    if (input.goal !== "code_change")
        return "objective";
    if (input.objectiveBasedRuns === false)
        return "direct";
    const mentionedPaths = Array.isArray(input.mentionedPaths) ? input.mentionedPaths.filter(Boolean) : [];
    const activeFilePath = String(input.activeFilePath || "").trim();
    const openFilePaths = Array.isArray(input.openFilePaths) ? input.openFilePaths.filter(Boolean) : [];
    const preferredTargetPath = String(input.preferredTargetPath || "").trim();
    const resolvedTargetCount = Math.max(0, Number(input.resolvedTargetCount ?? 0));
    const trustedTargetCount = Math.max(0, Number(input.trustedTargetCount ?? 0));
    const concreteEntityResolved = input.concreteEntityResolved !== false;
    const stripped = stripMentionTokens(input.prompt);
    const hasSingularExplicitTarget = mentionedPaths.length === 1;
    const hasImplicitEditorTarget = mentionedPaths.length === 0 &&
        (wantsCurrentFileInspection(input.prompt) || referencesActiveEditingContext(input.prompt)) &&
        Boolean(activeFilePath || openFilePaths[0]);
    const hasRuntimeResolvedSingleTarget = Boolean(preferredTargetPath) &&
        concreteEntityResolved &&
        (trustedTargetCount === 1 || resolvedTargetCount === 1);
    const hasSingleTarget = hasSingularExplicitTarget || hasImplicitEditorTarget || hasRuntimeResolvedSingleTarget;
    const hasBroadSignals = wantsBroadWorkspaceDiscovery(input.prompt);
    const hasMultiTargetSignals = mentionedPaths.length > 1 ||
        trustedTargetCount > 1 ||
        resolvedTargetCount > 1 ||
        /\b(files|modules|components|screens|routes|across|throughout|everywhere|multiple|repo-wide|project-wide)\b/i.test(stripped);
    if (hasSingleTarget && hasActionVerb(input.prompt) && !hasBroadSignals && !hasMultiTargetSignals) {
        return "direct";
    }
    if (hasBroadSignals || hasMultiTargetSignals) {
        return "objective";
    }
    return hasSingleTarget ? "direct" : "objective";
}
function resolveNativeNextToolHints(input) {
    if (input.goal !== "code_change")
        return [];
    if (input.autonomyMode !== "direct")
        return [];
    if (input.noOpConclusion) {
        return input.hasVerifiedOutcome ? [] : ["run_command", "get_diagnostics"];
    }
    if (input.hasCompletedMutation) {
        return input.hasVerifiedOutcome ? [] : ["run_command", "get_diagnostics"];
    }
    if (!input.preferredTargetPath) {
        return ["search_workspace", "list_files"];
    }
    if (!input.hasCompletedRead) {
        return ["read_file"];
    }
    if (input.targetAcquisitionPhase === "semantic_recovery" ||
        input.currentRepairTactic === "semantic_search" ||
        input.currentRepairTactic === "example_search" ||
        input.currentRepairTactic === "command_assisted_repair") {
        return ["run_command", "search_workspace", "patch_file", "write_file"];
    }
    if (input.currentRepairTactic === "full_rewrite") {
        return ["write_file", "run_command"];
    }
    return ["patch_file", "run_command", "write_file"];
}
function findToolArtifactStart(raw) {
    const text = stripCodeFence(String(raw || ""));
    if (!text.trim())
        return -1;
    const directPatterns = [
        /\[TOOL_CALL\]/i,
        /\[\/TOOL_CALL\]/i,
        /\btool_call\s*:/i,
        /\btool_calls\s*:/i,
        /"tool_call"\s*:/i,
        /"tool_calls"\s*:/i,
        /"toolCalls"\s*:/i,
        /"type"\s*:\s*"tool_batch"/i,
        /\{\s*"toolName"\s*:\s*"[^"]+"\s*,?[\s\S]*"(?:arguments|args)"\s*:/i,
        /\{\s*"name"\s*:\s*"[^"]+"\s*,?[\s\S]*"(?:arguments|args)"\s*:/i,
        /\{\s*"tool"\s*:\s*"[^"]+"\s*,?[\s\S]*"(?:arguments|args)"\s*:/i,
    ];
    for (const pattern of directPatterns) {
        const match = pattern.exec(text);
        if (match?.index !== undefined)
            return match.index;
    }
    const trimmed = text.trimStart();
    const leadingOffset = text.length - trimmed.length;
    if (/^(?:\{|\[)/.test(trimmed)) {
        if (/"type"\s*:\s*"tool_(?:call|calls)"/i.test(trimmed))
            return leadingOffset;
        if (/"toolName"\s*:\s*"[^"]+"\s*,?[\s\S]*"(?:arguments|args)"\s*:/i.test(trimmed))
            return leadingOffset;
        if (/"name"\s*:\s*"[^"]+"\s*,?[\s\S]*"(?:arguments|args)"\s*:/i.test(trimmed))
            return leadingOffset;
        if (/"tool"\s*:\s*"[^"]+"\s*,?[\s\S]*"(?:arguments|args)"\s*:/i.test(trimmed))
            return leadingOffset;
    }
    return -1;
}
function looksLikeCutieToolArtifactText(raw) {
    return findToolArtifactStart(raw) >= 0;
}
function extractVisibleAssistantText(raw) {
    const text = String(raw || "");
    const artifactStart = findToolArtifactStart(text);
    if (artifactStart < 0)
        return text;
    return text.slice(0, artifactStart).trimEnd();
}
//# sourceMappingURL=cutie-native-autonomy.js.map