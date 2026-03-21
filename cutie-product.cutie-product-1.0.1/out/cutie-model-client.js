"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieModelClient = void 0;
const vscode_core_1 = require("@xpersona/vscode-core");
const config_1 = require("./config");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
class CutieModelClient {
    async completeTurn(input) {
        const response = await (0, vscode_core_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/cutie/model/chat`, input.auth, {
            model: (0, config_1.getModelHint)(),
            stream: false,
            messages: input.messages,
            ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
            ...(typeof input.maxTokens === "number" ? { maxTokens: input.maxTokens } : {}),
        }, {
            signal: input.signal,
        });
        return {
            rawText: String(response.text || ""),
            finalText: String(response.text || ""),
            usage: response.usage && typeof response.usage === "object" ? response.usage : null,
            model: typeof response.model === "string" && response.model.trim() ? response.model.trim() : undefined,
        };
    }
    async streamTurn(input) {
        let accumulated = "";
        let usage = null;
        let resolvedModel;
        const endpoint = `${(0, config_1.getBaseApiUrl)()}/api/v1/cutie/model/chat`;
        await (0, vscode_core_1.streamJsonEvents)("POST", endpoint, input.auth, {
            model: (0, config_1.getModelHint)(),
            stream: true,
            messages: input.messages,
        }, async (event, data) => {
            if (event === "delta") {
                const text = String(asRecord(data).text || "");
                if (!text)
                    return;
                accumulated += text;
                await input.onDelta?.(text, accumulated);
                return;
            }
            if (event === "final" && typeof data === "string") {
                accumulated = data;
                return;
            }
            if (event === "meta") {
                const payload = asRecord(data);
                if (payload.usage && typeof payload.usage === "object") {
                    usage = payload.usage;
                }
                if (typeof payload.model === "string") {
                    resolvedModel = payload.model;
                }
                return;
            }
            if (event === "error") {
                const payload = asRecord(data);
                throw new Error(String(payload.message || "Cutie model request failed."));
            }
        }, {
            signal: input.signal,
        });
        if (!accumulated.trim()) {
            const fallback = await this.completeTurn({
                auth: input.auth,
                signal: input.signal,
                messages: input.messages,
            }).catch(() => null);
            if (fallback) {
                accumulated = fallback.finalText;
                resolvedModel = fallback.model || resolvedModel;
                if (fallback.usage && typeof fallback.usage === "object") {
                    usage = fallback.usage;
                }
            }
        }
        return {
            rawText: accumulated,
            finalText: accumulated,
            usage,
            model: resolvedModel,
        };
    }
}
exports.CutieModelClient = CutieModelClient;
//# sourceMappingURL=cutie-model-client.js.map