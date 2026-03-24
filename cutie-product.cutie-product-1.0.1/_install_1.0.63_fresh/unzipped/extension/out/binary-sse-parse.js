"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBinarySseEventDataJson = parseBinarySseEventDataJson;
/**
 * Parse one SSE event block into a JSON payload string, or null if skip.
 * Shared by `binary-api-client` and unit tests (no VS Code / vscode-core imports).
 */
function parseBinarySseEventDataJson(rawChunk) {
    const lines = rawChunk.split(/\r?\n/);
    let payload = "";
    for (const line of lines) {
        if (line.startsWith("data:"))
            payload += line.slice(5).trimStart();
    }
    if (!payload || payload === "[DONE]")
        return null;
    return payload;
}
//# sourceMappingURL=binary-sse-parse.js.map