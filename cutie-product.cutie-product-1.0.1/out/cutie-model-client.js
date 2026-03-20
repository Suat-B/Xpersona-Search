"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieModelClient = void 0;
const vscode_core_1 = require("@xpersona/vscode-core");
const config_1 = require("./config");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
class CutieModelClient {
    async streamTurn(input) {
        let accumulated = "";
        let usage = null;
        let resolvedModel;
        await (0, vscode_core_1.streamJsonEvents)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/cutie/model/chat`, input.auth, {
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