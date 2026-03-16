"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatAssistantStreamText = formatAssistantStreamText;
function normalizeStreamText(value) {
    return String(value || "").replace(/\r\n/g, "\n").trim();
}
function formatAssistantStreamText(input) {
    const reasoning = normalizeStreamText(input.reasoningText);
    const answer = normalizeStreamText(input.answerText);
    if (reasoning && answer) {
        return `Reasoning:\n${reasoning}\n\nAnswer:\n${answer}`;
    }
    if (reasoning) {
        return `Reasoning:\n${reasoning}`;
    }
    return answer;
}
//# sourceMappingURL=qwen-stream-format.js.map