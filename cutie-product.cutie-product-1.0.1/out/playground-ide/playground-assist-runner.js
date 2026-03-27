"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playgroundRequestAssist = playgroundRequestAssist;
exports.playgroundContinueRun = playgroundContinueRun;
exports.runPlaygroundToolLoop = runPlaygroundToolLoop;
const api_client_1 = require("./api-client");
const pg_config_1 = require("./pg-config");
async function playgroundRequestAssist(auth, body, signal) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, pg_config_1.getBaseApiUrl)()}/api/v1/playground/assist`, auth, body, { signal });
    return (response?.data || response);
}
async function playgroundContinueRun(auth, runId, toolResult, signal, sessionId) {
    const url = `${(0, pg_config_1.getBaseApiUrl)()}/api/v1/playground/runs/${encodeURIComponent(runId)}/continue`;
    const sid = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : "";
    const body = sid ? { toolResult, sessionId: sid } : { toolResult };
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 400 * attempt));
        }
        if (signal?.aborted)
            throw new Error("Prompt aborted");
        try {
            const response = await (0, api_client_1.requestJson)("POST", url, auth, body, { signal });
            return (response?.data || response);
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (lastError.message.includes("RUN_NOT_FOUND") && attempt < 2)
                continue;
            throw lastError;
        }
    }
    throw lastError ?? new Error("Continue run failed");
}
async function runPlaygroundToolLoop(input) {
    let envelope = input.initial;
    const maxSteps = 64;
    for (let step = 0; step < maxSteps; step++) {
        if (!envelope.pendingToolCall || !envelope.runId)
            return envelope;
        if (input.signal?.aborted)
            throw new Error("Prompt aborted");
        const pendingToolCall = envelope.pendingToolCall;
        const toolResult = await input.toolExecutor.executeToolCall({
            pendingToolCall,
            auth: input.auth,
            sessionId: input.sessionId,
            workspaceFingerprint: input.workspaceFingerprint,
            signal: input.signal,
            onDidMutateFile: input.onDidMutateFile,
        });
        envelope = await playgroundContinueRun(input.auth, envelope.runId, toolResult, input.signal, input.sessionId || envelope.sessionId);
    }
    return envelope;
}
//# sourceMappingURL=playground-assist-runner.js.map