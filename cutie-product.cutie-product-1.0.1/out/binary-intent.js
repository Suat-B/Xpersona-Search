"use strict";
/** Aligned with vscode-extension/src/assistant-ux.ts classifyIntent. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyIntent = classifyIntent;
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
//# sourceMappingURL=binary-intent.js.map