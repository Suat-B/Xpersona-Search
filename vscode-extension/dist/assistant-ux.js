"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyIntent = classifyIntent;
exports.isEditLikeIntent = isEditLikeIntent;
exports.assessContextConfidence = assessContextConfidence;
exports.buildContextSummary = buildContextSummary;
exports.buildContextPreviewMessage = buildContextPreviewMessage;
exports.buildClarificationActions = buildClarificationActions;
exports.buildFollowUpActions = buildFollowUpActions;
exports.buildPatchConfidence = buildPatchConfidence;
function uniquePaths(values, limit) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        const normalized = String(value || "").trim().replace(/\\/g, "/");
        const key = normalized.toLowerCase();
        if (!normalized || seen.has(key))
            continue;
        seen.add(key);
        out.push(normalized);
        if (out.length >= limit)
            break;
    }
    return out;
}
function classifyIntent(task) {
    const text = String(task || "").trim().toLowerCase();
    if (!text)
        return "ask";
    if (/\b(fix|change|update|edit|modify|patch|refactor|rewrite|implement|add|create|remove|delete|rename|replace|apply|wire|support|improve|clean up|make)\b/.test(text)) {
        return "change";
    }
    if (/\b(explain|why|walk me through|help me understand|what does|what is happening|summarize|break down|expand on|elaborate on|build on)\b/.test(text)) {
        return "explain";
    }
    if (/\b(find|search|locate|where is|grep|look for|show me references|trace)\b/.test(text)) {
        return "find";
    }
    return "ask";
}
function isEditLikeIntent(intent) {
    return intent === "change";
}
function assessContextConfidence(input) {
    let score = 0.18;
    const reasons = [];
    if (input.hasAttachedSelection) {
        score += 0.44;
        reasons.push("attached selection");
    }
    if (input.attachedFiles.length) {
        score += 0.28;
        reasons.push("manual file attachment");
    }
    if (input.explicitReferenceCount > 0) {
        score += 0.26;
        reasons.push("explicit file reference");
    }
    if (input.resolvedFiles.length === 1) {
        score += 0.22;
        reasons.push("single likely target");
    }
    else if (input.resolvedFiles.length > 1) {
        score += 0.12;
        reasons.push("multiple likely targets");
    }
    if (input.selectedFilesCount > 0) {
        score += 0.1;
        reasons.push("relevant snippets");
    }
    if (input.memoryFiles?.length) {
        score += 0.05;
        reasons.push("workspace memory hints");
    }
    if (input.diagnosticsCount > 0) {
        score += 0.05;
        reasons.push("live diagnostics");
    }
    if (input.intent === "change" && !input.resolvedFiles.length) {
        score -= 0.24;
        reasons.push("no resolved edit target");
    }
    if (input.candidateFiles.length > Math.max(1, input.resolvedFiles.length + 1)) {
        score -= 0.16;
        reasons.push("multiple candidates");
    }
    const bounded = Math.max(0, Math.min(score, 1));
    const confidence = bounded >= 0.72 ? "high" : bounded >= 0.48 ? "medium" : "low";
    return {
        confidence,
        score: bounded,
        rationale: reasons.length ? reasons.join(", ") : "basic workspace context",
    };
}
function buildContextSummary(preview) {
    return {
        ...(preview.workspaceRoot ? { workspaceRoot: preview.workspaceRoot } : {}),
        likelyTargets: uniquePaths(preview.resolvedFiles, 4),
        candidateTargets: uniquePaths(preview.candidateFiles, 4),
        attachedFiles: uniquePaths(preview.attachedFiles, 4),
        memoryTargets: uniquePaths(preview.memoryFiles, 4),
        ...(preview.attachedSelection ? { attachedSelection: preview.attachedSelection } : {}),
        note: preview.confidence === "high"
            ? "Ready to move fast"
            : preview.confidence === "medium"
                ? "Likely right, but worth a quick glance"
                : "Needs a target check before editing",
    };
}
function buildContextPreviewMessage(preview) {
    const attachedTargets = uniquePaths([...preview.resolvedFiles, ...preview.attachedFiles, ...preview.selectedFiles], 4);
    const sections = [
        `Context preview: ${preview.intent.toUpperCase()} | ${preview.confidence.toUpperCase()} confidence`,
        attachedTargets.length ? `Attached: ${attachedTargets.join(", ")}` : "",
        preview.attachedSelection ? `Selection: ${preview.attachedSelection.path}` : "",
    ].filter(Boolean);
    return sections.join("\n");
}
function buildClarificationActions(input) {
    return input.candidateFiles.slice(0, 4).map((pathValue) => ({
        id: `target:${pathValue}`,
        label: pathValue.split("/").pop() || pathValue,
        kind: "target",
        targetPath: pathValue,
        detail: pathValue,
        emphasized: true,
    }));
}
function buildFollowUpActions(input) {
    const actions = [];
    if (input.intent === "change" && input.patchConfidence === "needs_review") {
        actions.push({
            id: "prompt:run-validation",
            label: "Run checks",
            kind: "prompt",
            prompt: "Run the quickest validation checks for the latest change (lint/test/build as available) and summarize only failures.",
            detail: "Confirm the edit is safe",
            emphasized: true,
        });
    }
    if (input.intent === "change" && input.preview.confidence !== "high") {
        actions.push({
            id: "retry-more-context",
            label: "Retry with context",
            kind: "rerun",
            detail: "Attach active file and selection",
            emphasized: actions.length === 0,
        });
    }
    return actions.slice(0, 3);
}
function buildPatchConfidence(input) {
    if (input.intent !== "change" || !input.didMutate)
        return null;
    return input.preview.confidence === "high" && input.preview.diagnostics.length > 0
        ? "high"
        : "needs_review";
}
//# sourceMappingURL=assistant-ux.js.map