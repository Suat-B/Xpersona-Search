"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBinaryBuild = createBinaryBuild;
exports.getBinaryBuild = getBinaryBuild;
exports.validateBinaryBuild = validateBinaryBuild;
exports.publishBinaryBuild = publishBinaryBuild;
const api_client_1 = require("./api-client");
const config_1 = require("./config");
async function createBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds`, input.auth, {
        intent: input.intent,
        workspaceFingerprint: input.workspaceFingerprint,
        ...(input.historySessionId ? { historySessionId: input.historySessionId } : {}),
        targetEnvironment: input.targetEnvironment,
        ...(input.context ? { context: input.context } : {}),
        ...(input.retrievalHints ? { retrievalHints: input.retrievalHints } : {}),
    });
    return (response?.data || response);
}
async function getBinaryBuild(auth, buildId) {
    const response = await (0, api_client_1.requestJson)("GET", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(buildId)}`, auth);
    return (response?.data || response);
}
async function validateBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/validate`, input.auth, {
        targetEnvironment: input.targetEnvironment,
    });
    return (response?.data || response);
}
async function publishBinaryBuild(input) {
    const response = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/binary/builds/${encodeURIComponent(input.buildId)}/publish`, input.auth, {});
    return (response?.data || response);
}
//# sourceMappingURL=binary-client.js.map