"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieModelAdapter = void 0;
const config_1 = require("./config");
const cutie_model_capabilities_1 = require("./cutie-model-capabilities");
function applyTelemetry(result, input) {
    const normalizationSource = result.normalizationSource || (input.resolvedMode === "final_only" ? "plain_final" : "plain_final");
    return {
        ...result,
        modelAdapter: (0, cutie_model_capabilities_1.getCutieModelAdapterKind)(),
        modelCapabilities: input.capabilities,
        protocolMode: input.resolvedMode,
        normalizationSource,
        fallbackModeUsed: result.fallbackModeUsed ||
            (0, cutie_model_capabilities_1.inferFallbackModeUsed)({
                requestedMode: input.requestedMode,
                resolvedMode: input.resolvedMode,
                normalizationSource,
            }),
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