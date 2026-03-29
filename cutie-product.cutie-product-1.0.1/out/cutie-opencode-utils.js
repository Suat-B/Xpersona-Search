"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUTIE_OPENCODE_PROVIDER_ID = void 0;
exports.normalizeOpenCodeServerUrl = normalizeOpenCodeServerUrl;
exports.parseOpenCodeServerAddress = parseOpenCodeServerAddress;
exports.isLocalOpenCodeServerUrl = isLocalOpenCodeServerUrl;
exports.buildOpenCodeModelRef = buildOpenCodeModelRef;
exports.buildOpenCodeConfigTemplate = buildOpenCodeConfigTemplate;
exports.extractAssistantTextFromOpenCodeParts = extractAssistantTextFromOpenCodeParts;
exports.truncateOpenCodeNarration = truncateOpenCodeNarration;
exports.CUTIE_OPENCODE_PROVIDER_ID = "cutie-openai-compatible";
const DEFAULT_OPENCODE_SERVER_URL = "http://127.0.0.1:4096";
function normalizeOpenCodeServerUrl(value) {
    const raw = String(value || "").trim();
    if (!raw)
        return DEFAULT_OPENCODE_SERVER_URL;
    const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
    try {
        const url = new URL(withProtocol);
        url.pathname = "";
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    }
    catch {
        return DEFAULT_OPENCODE_SERVER_URL;
    }
}
function parseOpenCodeServerAddress(serverUrl) {
    const normalizedUrl = normalizeOpenCodeServerUrl(serverUrl);
    const url = new URL(normalizedUrl);
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    return {
        normalizedUrl,
        hostname: url.hostname || "127.0.0.1",
        port,
    };
}
function isLocalOpenCodeServerUrl(serverUrl) {
    try {
        const { hostname } = parseOpenCodeServerAddress(serverUrl);
        const lower = hostname.toLowerCase();
        return lower === "127.0.0.1" || lower === "localhost" || lower === "::1";
    }
    catch {
        return false;
    }
}
function buildOpenCodeModelRef(model) {
    const trimmed = String(model || "").trim();
    if (!trimmed)
        return `${exports.CUTIE_OPENCODE_PROVIDER_ID}/moonshotai/Kimi-K2.5:fastest`;
    return trimmed.startsWith(`${exports.CUTIE_OPENCODE_PROVIDER_ID}/`)
        ? trimmed
        : `${exports.CUTIE_OPENCODE_PROVIDER_ID}/${trimmed}`;
}
function buildOpenCodeConfigTemplate(input) {
    const { hostname, port } = parseOpenCodeServerAddress(input.serverUrl || DEFAULT_OPENCODE_SERVER_URL);
    const model = String(input.model || "").trim() || "moonshotai/Kimi-K2.5:fastest";
    const modelRef = buildOpenCodeModelRef(model);
    const baseUrl = String(input.openAiBaseUrl || "").trim();
    const providerModels = {
        [model]: {
            name: model,
        },
    };
    const provider = {
        npm: "@ai-sdk/openai-compatible",
        name: "Cutie OpenAI-Compatible",
        models: providerModels,
    };
    if (baseUrl) {
        provider.options = {
            baseURL: baseUrl,
        };
    }
    return {
        $schema: "https://opencode.ai/config.json",
        server: {
            hostname,
            port,
        },
        provider: {
            [exports.CUTIE_OPENCODE_PROVIDER_ID]: provider,
        },
        model: modelRef,
        permission: {
            edit: "ask",
            bash: "ask",
            webfetch: "deny",
            external_directory: "deny",
        },
    };
}
function extractAssistantTextFromOpenCodeParts(parts) {
    if (!Array.isArray(parts))
        return "";
    return parts
        .filter((part) => part && part.type === "text" && !part.ignored && typeof part.text === "string")
        .map((part) => String(part.text || ""))
        .join("")
        .trim();
}
function truncateOpenCodeNarration(value, limit = 240) {
    const compact = String(value || "").replace(/\s+/g, " ").trim();
    if (compact.length <= limit)
        return compact;
    return `${compact.slice(0, Math.max(1, limit - 1))}…`;
}
//# sourceMappingURL=cutie-opencode-utils.js.map