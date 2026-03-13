"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_CONTENT_DELTA_REASON_PREFIX = void 0;
exports.classifyLocalApplyFailure = classifyLocalApplyFailure;
exports.isNoContentDeltaReason = isNoContentDeltaReason;
exports.collapseConflictingFileActions = collapseConflictingFileActions;
exports.nextLocalRecoveryStage = nextLocalRecoveryStage;
exports.buildLocalApplyRetryTask = buildLocalApplyRetryTask;
exports.NO_CONTENT_DELTA_REASON_PREFIX = "no_content_delta:";
function normalizeActionPath(path) {
    return String(path || "")
        .replace(/\\/g, "/")
        .replace(/^\.\/+/, "")
        .replace(/^\/+/, "")
        .trim()
        .toLowerCase();
}
function classifyLocalApplyFailure(input) {
    const reason = String(input.reason || "").trim();
    const normalized = reason.toLowerCase();
    if (/no workspace folder open/i.test(reason)) {
        return { category: "workspace_unavailable", summary: `${input.path}: no workspace folder is open.`, retryable: false };
    }
    if (!input.changed && /(already matched requested content|did not change content|patch produced no file changes|no file content changed)/i.test(reason)) {
        return { category: "no_content_delta", summary: `${input.path}: the requested change produced no content delta.`, retryable: true };
    }
    if (input.actionKind === "write_file" && /overwrite=false|already exists/i.test(reason)) {
        return { category: "write_blocked", summary: `${input.path}: write_file was blocked by overwrite rules.`, retryable: false };
    }
    if (input.status === "rejected_invalid_patch") {
        if (/unsupported patch format/i.test(reason)) {
            return { category: "unsupported_patch_shape", summary: `${input.path}: the patch shape was unsupported locally.`, retryable: true };
        }
        return { category: "invalid_patch", summary: `${input.path}: the patch was invalid or malformed.`, retryable: true };
    }
    if (/invalid target path|invalid relative path|missing\/invalid target path|patch header/i.test(reason)) {
        return { category: "path_mismatch", summary: `${input.path}: the edit target path did not match a valid workspace file.`, retryable: true };
    }
    if (input.actionKind === "edit" && input.targetExistedBefore === false) {
        return { category: "target_missing", summary: `${input.path}: the target file did not exist for patch-based editing.`, retryable: true };
    }
    if (!input.changed) {
        return { category: "no_content_delta", summary: `${input.path}: the requested change did not modify file content.`, retryable: true };
    }
    return { category: "unknown_apply_failure", summary: `${input.path}: local apply failed${normalized ? ` (${reason})` : ""}.`, retryable: true };
}
function isNoContentDeltaReason(reason) {
    const normalized = String(reason || "").trim().toLowerCase();
    return normalized.startsWith(exports.NO_CONTENT_DELTA_REASON_PREFIX) || /no file content changed/i.test(normalized);
}
function collapseConflictingFileActions(actions) {
    const latestFileActionIndexByPath = new Map();
    for (let index = 0; index < actions.length; index += 1) {
        const action = actions[index];
        if (!action || (action.type !== "edit" && action.type !== "write_file"))
            continue;
        const normalizedPath = normalizeActionPath(action.path);
        if (!normalizedPath)
            continue;
        latestFileActionIndexByPath.set(normalizedPath, index);
    }
    const collapsedCounts = new Map();
    const filtered = actions.filter((action, index) => {
        if (!action || (action.type !== "edit" && action.type !== "write_file"))
            return true;
        const normalizedPath = normalizeActionPath(action.path);
        if (!normalizedPath)
            return true;
        const keep = latestFileActionIndexByPath.get(normalizedPath) === index;
        if (!keep) {
            const label = String(action.path || normalizedPath);
            collapsedCounts.set(label, (collapsedCounts.get(label) || 0) + 1);
        }
        return keep;
    });
    return {
        actions: filtered,
        collapsedPaths: Array.from(collapsedCounts.entries()).map(([filePath, count]) => count > 1 ? `${filePath} (${count} earlier actions)` : filePath),
    };
}
function nextLocalRecoveryStage(attemptedStages, filePath, category) {
    const isPine = filePath.toLowerCase().endsWith(".pine");
    const ordered = category === "no_content_delta"
        ? [
            ...(isPine ? ["pine_specialization"] : []),
            "single_file_rewrite",
        ]
        : [
            "patch_repair",
            "target_path_repair",
            "single_file_rewrite",
            ...(isPine ? ["pine_specialization"] : []),
        ];
    for (const stage of ordered) {
        if (!attemptedStages.includes(stage))
            return stage;
    }
    return null;
}
function buildLocalApplyRetryTask(input) {
    const header = input.objective.trim();
    const reasonLine = input.reason ? `Previous local apply failure: ${input.reason}` : `Previous local apply category: ${input.category}`;
    const shared = [
        header,
        "",
        `Target file: ${input.filePath}`,
        reasonLine,
        "The prior response did not successfully mutate the local workspace.",
        "Return concrete file actions only. Do not narrate completed work.",
    ];
    if (input.stage === "patch_repair") {
        return [
            ...shared,
            "Recovery stage: patch_repair.",
            "Return a corrected edit action or a write_file action for exactly this file.",
            "If you use edit, the patch must apply cleanly to the current file contents.",
        ].join("\n");
    }
    if (input.stage === "target_path_repair") {
        return [
            ...shared,
            "Recovery stage: target_path_repair.",
            "Bind every file action to exactly the target file above.",
            "Do not invent alternate paths or omit the target path.",
        ].join("\n");
    }
    if (input.stage === "single_file_rewrite") {
        return [
            ...shared,
            "Recovery stage: single_file_rewrite.",
            'Return a single write_file action for exactly this file with the full updated file contents.',
            "The returned file content must differ from the current workspace file and implement a real semantic change.",
            "Do not echo the existing file contents back unchanged.",
            "Preserve unchanged code and only implement the requested change.",
        ].join("\n");
    }
    return [
        ...shared,
        "Recovery stage: pine_specialization.",
        'Return a single write_file action for exactly this .pine strategy file.',
        "The returned Pine file content must differ from the current workspace file and implement a real strategy change.",
        "Do not echo the existing .pine file back unchanged.",
        "Use Pine strategy structure from the active file and implement the requested strategy change without commentary.",
    ].join("\n");
}
//# sourceMappingURL=apply-recovery-utils.js.map