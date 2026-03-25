"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveBinaryNaturalLanguageAction = resolveBinaryNaturalLanguageAction;
function normalizeBinaryPrompt(text) {
    return String(text || "").trim();
}
function containsAnyPromptToken(promptLower, patterns) {
    return patterns.some((pattern) => pattern.test(promptLower));
}
function extractCheckpointId(prompt) {
    const match = /\b(?:checkpoint|save\s*point)\s*[:#]?\s*([A-Za-z0-9._:-]+)/i.exec(prompt);
    const checkpointId = String(match?.[1] || "").trim();
    return checkpointId || undefined;
}
function extractEntrypoint(prompt) {
    const quoted = /\b(?:run|execute)\s+["']?([A-Za-z_][\w.$:-]*)["']?/i.exec(prompt);
    const entryPoint = String(quoted?.[1] || "").trim();
    return entryPoint || undefined;
}
function stripActionPrefix(prompt) {
    return prompt
        .replace(/^(?:please\s+)?(?:can you\s+)?(?:could you\s+)?(?:start|create|make|build|generate|refine|improve|update|edit|branch|fork|rewind|rollback|run|execute|validate|publish|deploy|cancel|stop)\b[:\s-]*/i, "")
        .trim();
}
function hasExplicitNewBuildIntent(promptLower) {
    return containsAnyPromptToken(promptLower, [
        /\b(new build|fresh build|new app)\b/i,
        /\b(start over|from scratch)\b/i,
        /\b(create|generate|build)\b.*\b(new|another)\b/i,
        /\bgenerate\b/i,
        /\bcreate app\b/i,
        /\bbuild app\b/i,
    ]);
}
function resolveBinaryNaturalLanguageAction(rawPrompt, options = {}) {
    const prompt = normalizeBinaryPrompt(rawPrompt);
    const promptLower = prompt.toLowerCase();
    const checkpointId = extractCheckpointId(prompt);
    const entryPoint = extractEntrypoint(prompt);
    const intentWithoutPrefix = stripActionPrefix(prompt);
    const intent = intentWithoutPrefix || prompt;
    // Precedence: cancel > validate > publish > rewind > branch > execute > explicit new-build > default.
    if (containsAnyPromptToken(promptLower, [/\b(cancel|stop|abort|halt)\b/i])) {
        return { type: "cancel" };
    }
    if (containsAnyPromptToken(promptLower, [/\b(validate|verification|verify|quality check|check quality)\b/i])) {
        return { type: "validate" };
    }
    if (containsAnyPromptToken(promptLower, [/\b(publish|deploy|release|ship|share)\b/i])) {
        return { type: "publish" };
    }
    if (containsAnyPromptToken(promptLower, [/\b(rewind|rollback|roll back|restore|go back|undo)\b/i])) {
        return { type: "rewind", ...(checkpointId ? { checkpointId } : {}) };
    }
    if (containsAnyPromptToken(promptLower, [/\b(branch|fork|new version|variant)\b/i])) {
        return {
            type: "branch",
            ...(intent ? { intent } : {}),
            ...(checkpointId ? { checkpointId } : {}),
        };
    }
    if (containsAnyPromptToken(promptLower, [/\b(run|execute|invoke)\b/i])) {
        return { type: "execute", ...(entryPoint ? { entryPoint } : {}) };
    }
    if (hasExplicitNewBuildIntent(promptLower)) {
        return { type: "generate", intent };
    }
    if (options.hasActiveBuild) {
        return { type: "refine", intent };
    }
    return { type: "generate", intent };
}
//# sourceMappingURL=cutie-binary-nl-router.js.map