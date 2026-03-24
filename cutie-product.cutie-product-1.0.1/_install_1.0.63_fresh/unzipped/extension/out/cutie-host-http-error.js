"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.humanizeCutieHostHttpError = humanizeCutieHostHttpError;
/**
 * Map @xpersona/vscode-core HTTP errors (`HTTP <code>: <body>`) to short user-facing reasons.
 */
function humanizeCutieHostHttpError(error) {
    const msg = error instanceof Error ? error.message : String(error);
    const m = msg.match(/^HTTP (\d+):\s*([\s\S]*)$/);
    if (!m)
        return null;
    const code = Number(m[1]);
    const bodyRaw = (m[2] || "").trim();
    const body = bodyRaw.slice(0, 800).toLowerCase();
    if (code === 401) {
        return "The API rejected the request (authentication required). Sign in again or check your API key.";
    }
    if (code === 402) {
        return "The API rejected the request (payment or credits required). Check your account or billing.";
    }
    if (code === 403) {
        return "The API rejected the request (forbidden or insufficient permissions). Check credentials or account access.";
    }
    if (code === 429) {
        return "The API rate limit was exceeded. Wait a moment and try again.";
    }
    if (code >= 500) {
        return "The API server returned an error. Try again later or check service status.";
    }
    const creditHints = /credit|quota|balance|billing|payment|insufficient funds|exceeded your/;
    if (creditHints.test(body)) {
        return "The API rejected the request (likely credits or quota). Check your account limits or billing.";
    }
    const rateHints = /rate limit|too many requests|throttl/;
    if (rateHints.test(body)) {
        return "The API rate limit was exceeded. Wait a moment and try again.";
    }
    return null;
}
//# sourceMappingURL=cutie-host-http-error.js.map