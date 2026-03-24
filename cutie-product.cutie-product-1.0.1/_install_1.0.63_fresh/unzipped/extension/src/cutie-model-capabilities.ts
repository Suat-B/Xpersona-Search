import type {
  CutieFallbackModeUsed,
  CutieModelAdapterKind,
  CutieModelCapabilityProfile,
  CutieNormalizationSource,
  CutieProtocolMode,
} from "./types";

const DEFAULT_PROFILE: CutieModelCapabilityProfile = {
  profileId: "text-capable-conservative",
  modelPattern: "*",
  nativeTools: "partial",
  streamStructured: "partial",
  parallelTools: false,
  assistantDeltaReliability: "medium",
  maxToolsPerTurnPolicy: "prefer_serial",
  textExtractionFallback: true,
};

const MODEL_PROFILES: Array<{ pattern: RegExp; profile: CutieModelCapabilityProfile }> = [
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

export function getCutieModelAdapterKind(): CutieModelAdapterKind {
  return "capability_negotiated_v1";
}

export function resolveCutieModelCapabilities(modelHint?: string): CutieModelCapabilityProfile {
  const normalized = String(modelHint || "").trim();
  for (const candidate of MODEL_PROFILES) {
    if (candidate.pattern.test(normalized)) {
      return candidate.profile;
    }
  }
  return DEFAULT_PROFILE;
}

export function resolveProtocolMode(input: {
  desiredMode: CutieProtocolMode;
  capabilities: CutieModelCapabilityProfile;
}): CutieProtocolMode {
  if (input.desiredMode === "final_only") return "final_only";
  if (input.desiredMode === "text_extraction") return "text_extraction";
  if (input.capabilities.nativeTools === "reliable") return "native_tools";
  return input.capabilities.textExtractionFallback ? "text_extraction" : "native_tools";
}

export function resolveMaxToolsPerBatch(input: {
  requested: number;
  capabilities: CutieModelCapabilityProfile;
}): number {
  const requested = Math.max(1, input.requested || 1);
  if (input.capabilities.maxToolsPerTurnPolicy === "single_only") return 1;
  if (input.capabilities.maxToolsPerTurnPolicy === "prefer_serial") {
    return Math.min(requested, input.capabilities.parallelTools ? 2 : 1);
  }
  return input.capabilities.parallelTools ? requested : Math.min(requested, 1);
}

export function inferFallbackModeUsed(input: {
  requestedMode: CutieProtocolMode;
  resolvedMode: CutieProtocolMode;
  normalizationSource?: CutieNormalizationSource;
}): CutieFallbackModeUsed {
  if (input.requestedMode === "native_tools" && input.resolvedMode === "text_extraction") {
    return "text_extraction";
  }
  if (input.normalizationSource === "text_tool_artifact") {
    return "tool_forcing";
  }
  return "none";
}
