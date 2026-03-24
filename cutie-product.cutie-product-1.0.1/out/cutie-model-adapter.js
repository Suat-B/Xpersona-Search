"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieModelAdapter = void 0;
const config_1 = require("./config");
const cutie_model_capabilities_1 = require("./cutie-model-capabilities");
function resolveNormalizationTier(result, resolvedMode) {
    if (result.normalizationSource === "text_tool_artifact")
        return "artifact_rescue";
    if (result.normalizationSource === "deterministic_bootstrap")
        return "deterministic_recovery";
    if (resolvedMode === "final_only" || result.normalizationSource === "plain_final")
        return "plain_final";
    return "transport_normalized";
}
function collapseToCanonicalSingleAction(result) {
    if (result.response.type !== "tool_calls")
        return result;
    const first = result.response.tool_calls[0];
    if (!first)
        return result;
    return {
        ...result,
        response: {
            type: "tool_call",
            tool_call: first,
        },
        batchCollapsedToSingleAction: true,
    };
}
function applyTelemetry(result, input) {
    const canonical = collapseToCanonicalSingleAction(result);
    const normalizationSource = canonical.normalizationSource || (input.resolvedMode === "final_only" ? "plain_final" : "plain_final");
    const normalizationTier = canonical.normalizationTier || resolveNormalizationTier(canonical, input.resolvedMode);
    return {
        ...canonical,
        modelAdapter: (0, cutie_model_capabilities_1.getCutieModelAdapterKind)(),
        modelCapabilities: input.capabilities,
        protocolMode: input.resolvedMode,
        orchestratorContractVersion: "canonical_portability_v1",
        portabilityMode: "canonical_default",
        transportModeUsed: canonical.transportModeUsed || input.resolvedMode,
        normalizationSource,
        normalizationTier,
        fallbackModeUsed: canonical.fallbackModeUsed ||
            (0, cutie_model_capabilities_1.inferFallbackModeUsed)({
                requestedMode: input.requestedMode,
                resolvedMode: input.resolvedMode,
                normalizationSource,
            }),
        repairTierEntered: canonical.repairTierEntered ||
            (normalizationTier === "artifact_rescue" ? "artifact_rescue" : "none"),
    };
}
class CutieModelAdapter {
    constructor(client) {
        this.client = client;
    }
    describeSelectedModel(modelHint = (0, config_1.getModelHint)()) {
        return {
            modelHint,
            modelAdapter: (0, cutie_model_capabilities_1.getCutieModelAdapterKind)(),
            modelCapabilities: (0, cutie_model_capabilities_1.resolveCutieModelCapabilities)(modelHint),
        };
    }
    async requestTurn(input) {
        const modelHint = (0, config_1.getModelHint)();
        const capabilities = (0, cutie_model_capabilities_1.resolveCutieModelCapabilities)(modelHint);
        const resolvedMode = (0, cutie_model_capabilities_1.resolveProtocolMode)({
            desiredMode: input.desiredMode,
            capabilities,
        });
        const maxToolsPerBatch = (0, cutie_model_capabilities_1.resolveMaxToolsPerBatch)({
            requested: input.maxToolsPerBatch,
            capabilities,
        });
        if (resolvedMode === "final_only") {
            const textResult = await this.client.completeTurn({
                auth: input.auth,
                messages: input.messages,
                signal: input.signal,
            });
            return applyTelemetry({
                response: {
                    type: "final",
                    final: textResult.finalText.trim(),
                },
                assistantText: textResult.finalText.trim(),
                usage: textResult.usage,
                model: textResult.model,
                normalizationSource: "plain_final",
            }, {
                capabilities,
                resolvedMode,
                requestedMode: input.desiredMode,
            });
        }
        const result = input.stream === false
            ? await this.client.completeStructuredTurn({
                auth: input.auth,
                signal: input.signal,
                messages: input.messages,
                tools: input.tools,
                maxToolsPerBatch,
                protocolMode: resolvedMode,
            })
            : await this.client.streamStructuredTurn({
                auth: input.auth,
                signal: input.signal,
                messages: input.messages,
                tools: input.tools,
                maxToolsPerBatch,
                protocolMode: resolvedMode,
                onDelta: input.onDelta,
            });
        return applyTelemetry(result, {
            capabilities,
            resolvedMode,
            requestedMode: input.desiredMode,
        });
    }
}
exports.CutieModelAdapter = CutieModelAdapter;
//# sourceMappingURL=cutie-model-adapter.js.map