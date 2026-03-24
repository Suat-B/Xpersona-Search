"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCutieModelAdapterKind = getCutieModelAdapterKind;
exports.resolveCutieModelCapabilities = resolveCutieModelCapabilities;
exports.resolveProtocolMode = resolveProtocolMode;
exports.resolveMaxToolsPerBatch = resolveMaxToolsPerBatch;
exports.inferFallbackModeUsed = inferFallbackModeUsed;
const DEFAULT_PROFILE = {
    profileId: "text-capable-conservative",
    modelPattern: "*",
    nativeTools: "partial",
    streamStructured: "partial",
    parallelTools: false,
    assistantDeltaReliability: "medium",
    maxToolsPerTurnPolicy: "prefer_serial",
    textExtractionFallback: true,
};
const MODEL_PROFILES = [
    {
        pattern: /\b(gpt-4\.1|gpt-4o|gpt-5|o1|o3|o4)\b/i,
        profile: {
            profileId: "openai-native-tools",
            modelPattern: "gpt-4.1/gpt-4o/gpt-5/o*",
            nativeTools: "reliable",
            streamStructured: "reliable",
            parallelTools: true,
            assistantDeltaReliability: "high",
            maxToolsPerTurnPolicy: "allow_parallel",
            textExtractionFallback: true,
        },
    },
    {
        pattern: /\bclaude\b/i,
        profile: {
            profileId: "claude-compatible",
            modelPattern: "claude*",
            nativeTools: "partial",
            streamStructured: "partial",
            parallelTools: false,
            assistantDeltaReliability: "high",
            maxToolsPerTurnPolicy: "prefer_serial",
            textExtractionFallback: true,
        },
    },
    {
        pattern: /\b(gpt-oss|llama|mistral|qwen|deepseek|gemma)\b/i,
        profile: {
            profileId: "router-open-weights",
            modelPattern: "gpt-oss/llama/mistral/qwen/deepseek/gemma",
            nativeTools: "partial",
            streamStructured: "partial",
            parallelTools: true,
            assistantDeltaReliability: "medium",
            maxToolsPerTurnPolicy: "prefer_serial",
            textExtractionFallback: true,
        },
    },
];
function getCutieModelAdapterKind() {
    return "canonical_portability_v1";
}
function resolveCutieModelCapabilities(modelHint) {
    const normalized = String(modelHint || "").trim();
    for (const candidate of MODEL_PROFILES) {
        if (candidate.pattern.test(normalized)) {
            return candidate.profile;
        }
    }
    return DEFAULT_PROFILE;
}
function resolveProtocolMode(input) {
    if (input.desiredMode === "final_only")
        return "final_only";
    if (input.desiredMode === "text_extraction")
        return "text_extraction";
    if (input.capabilities.nativeTools === "reliable")
        return "native_tools";
    return input.capabilities.textExtractionFallback ? "text_extraction" : "native_tools";
}
function resolveMaxToolsPerBatch(input) {
    void input;
    return 1;
}
function inferFallbackModeUsed(input) {
    if (input.requestedMode === "native_tools" && input.resolvedMode === "text_extraction") {
        return "text_extraction";
    }
    if (input.normalizationSource === "text_tool_artifact") {
        return "tool_forcing";
    }
    return "none";
}
//# sourceMappingURL=cutie-model-capabilities.js.map