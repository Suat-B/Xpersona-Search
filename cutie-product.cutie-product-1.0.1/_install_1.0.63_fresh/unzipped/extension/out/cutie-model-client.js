"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieModelClient = void 0;
const vscode_core_1 = require("@xpersona/vscode-core");
const config_1 = require("./config");
const cutie_host_http_error_1 = require("./cutie-host-http-error");
const cutie_policy_1 = require("./cutie-policy");
const cutie_model_protocol_1 = require("./cutie-model-protocol");
const cutie_native_autonomy_1 = require("./cutie-native-autonomy");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function rethrowWithHostHttpHint(error) {
    const hint = (0, cutie_host_http_error_1.humanizeCutieHostHttpError)(error);
    if (hint)
        throw new Error(hint);
    throw error;
}
function buildStructuredRequestBody(input, stream) {
    return {
        model: (0, config_1.getModelHint)(),
        protocol: "cutie_tools_v2",
        protocolMode: input.protocolMode || "native_tools",
        stream,
        messages: (0, cutie_policy_1.limitCutieModelMessages)(input.messages),
        tools: input.tools,
        maxToolsPerBatch: input.maxToolsPerBatch,
    };
}
class CutieModelClient {
    async completeTurn(input) {
        let response;
        try {
            response = await (0, vscode_core_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/cutie/model/chat`, input.auth, {
                model: (0, config_1.getModelHint)(),
                stream: false,
                messages: (0, cutie_policy_1.limitCutieModelMessages)(input.messages),
                ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
                ...(typeof input.maxTokens === "number" ? { maxTokens: input.maxTokens } : {}),
            }, {
                signal: input.signal,
            });
        }
        catch (e) {
            rethrowWithHostHttpHint(e);
        }
        return {
            rawText: String(response.text || ""),
            finalText: String(response.text || ""),
            usage: response.usage && typeof response.usage === "object" ? response.usage : null,
            model: typeof response.model === "string" && response.model.trim() ? response.model.trim() : undefined,
        };
    }
    async completeStructuredTurn(input) {
        return this.withStructuredProtocolRetry(() => this.completeStructuredTurnOnce(input));
    }
    async streamStructuredTurn(input) {
        return this.withStructuredProtocolRetry(() => this.streamStructuredTurnOnce(input));
    }
    async withStructuredProtocolRetry(factory) {
        try {
            return await factory();
        }
        catch (error) {
            if (!(error instanceof cutie_model_protocol_1.CutieStructuredProtocolError)) {
                rethrowWithHostHttpHint(error);
            }
            try {
                return await factory();
            }
            catch (secondError) {
                if (secondError instanceof cutie_model_protocol_1.CutieStructuredProtocolError) {
                    throw new Error(`Cutie server returned an invalid cutie_tools_v2 response. ${secondError.message}`);
                }
                rethrowWithHostHttpHint(secondError);
            }
        }
    }
    async completeStructuredTurnOnce(input) {
        let response;
        try {
            response = await (0, vscode_core_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/cutie/model/chat`, input.auth, buildStructuredRequestBody(input, false), {
                signal: input.signal,
            });
        }
        catch (error) {
            rethrowWithHostHttpHint(error);
        }
        const normalized = (0, cutie_model_protocol_1.normalizeProtocolResponsePayload)(response.response ?? response);
        return {
            response: normalized,
            assistantText: typeof response.assistantText === "string" ? response.assistantText : "",
            usage: response.usage && typeof response.usage === "object" ? response.usage : null,
            model: typeof response.model === "string" && response.model.trim() ? response.model.trim() : undefined,
            ...(typeof response.modelAdapter === "string" ? { modelAdapter: response.modelAdapter } : {}),
            ...(response.modelCapabilities && typeof response.modelCapabilities === "object"
                ? { modelCapabilities: response.modelCapabilities }
                : {}),
            ...(typeof response.protocolMode === "string" ? { protocolMode: response.protocolMode } : {}),
            ...(typeof response.normalizationSource === "string"
                ? { normalizationSource: response.normalizationSource }
                : {}),
            ...(typeof response.fallbackModeUsed === "string"
                ? { fallbackModeUsed: response.fallbackModeUsed }
                : {}),
        };
    }
    async streamStructuredTurnOnce(input) {
        let assistantText = "";
        let rawAssistantText = "";
        let suppressedAssistantArtifact = "";
        let usage = null;
        let resolvedModel;
        let responsePayload = null;
        let modelAdapter;
        let modelCapabilities;
        let protocolMode;
        let normalizationSource;
        let fallbackModeUsed;
        try {
            await (0, vscode_core_1.streamJsonEvents)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/cutie/model/chat`, input.auth, buildStructuredRequestBody(input, true), async (event, data) => {
                const parsed = (0, cutie_model_protocol_1.parseStructuredStreamEvent)(event, data);
                if (parsed.type === "assistant_delta") {
                    rawAssistantText += parsed.text;
                    const visibleText = (0, cutie_native_autonomy_1.extractVisibleAssistantText)(rawAssistantText);
                    if ((0, cutie_native_autonomy_1.looksLikeCutieToolArtifactText)(rawAssistantText)) {
                        suppressedAssistantArtifact = rawAssistantText.trim();
                    }
                    if (visibleText.length > assistantText.length) {
                        const nextDelta = visibleText.slice(assistantText.length);
                        assistantText = visibleText;
                        await input.onDelta?.(nextDelta, assistantText);
                    }
                    return;
                }
                if (parsed.type === "noop") {
                    return;
                }
                if (parsed.type === "meta") {
                    if (parsed.usage && typeof parsed.usage === "object") {
                        usage = parsed.usage;
                    }
                    if (parsed.model) {
                        resolvedModel = parsed.model;
                    }
                    modelAdapter = parsed.modelAdapter || modelAdapter;
                    modelCapabilities = parsed.modelCapabilities || modelCapabilities;
                    protocolMode = parsed.protocolMode || protocolMode;
                    normalizationSource = parsed.normalizationSource || normalizationSource;
                    fallbackModeUsed = parsed.fallbackModeUsed || fallbackModeUsed;
                    return;
                }
                if (parsed.type === "error") {
                    throw new Error(parsed.message);
                }
                responsePayload = parsed.response;
            }, {
                signal: input.signal,
            });
        }
        catch (error) {
            rethrowWithHostHttpHint(error);
        }
        if (!responsePayload) {
            throw new cutie_model_protocol_1.CutieStructuredProtocolError("Missing final or tool_batch event in cutie_tools_v2 stream.");
        }
        return {
            response: responsePayload,
            assistantText,
            ...(suppressedAssistantArtifact ? { suppressedAssistantArtifact } : {}),
            usage,
            model: resolvedModel,
            ...(modelAdapter ? { modelAdapter } : {}),
            ...(modelCapabilities ? { modelCapabilities } : {}),
            ...(protocolMode ? { protocolMode } : {}),
            ...(normalizationSource ? { normalizationSource } : {}),
            ...(fallbackModeUsed ? { fallbackModeUsed } : {}),
        };
    }
}
exports.CutieModelClient = CutieModelClient;
//# sourceMappingURL=cutie-model-client.js.map