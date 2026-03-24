export type CutieServerCapabilityProfile = {
  profileId: string;
  modelPattern: string;
  nativeTools: "none" | "partial" | "reliable";
  streamStructured: "none" | "partial" | "reliable";
  parallelTools: boolean;
  assistantDeltaReliability: "low" | "medium" | "high";
  maxToolsPerTurnPolicy: "single_only" | "allow_parallel" | "prefer_serial";
  textExtractionFallback: boolean;
};

export type CutieServerProtocolMode = "native_tools" | "text_extraction" | "final_only";

const DEFAULT_PROFILE: CutieServerCapabilityProfile = {
  profileId: "text-capable-conservative",
  modelPattern: "*",
  nativeTools: "partial",
  streamStructured: "partial",
  parallelTools: false,
  assistantDeltaReliability: "medium",
  maxToolsPerTurnPolicy: "prefer_serial",
  textExtractionFallback: true,
};

const PROFILES: Array<{ pattern: RegExp; profile: CutieServerCapabilityProfile }> = [
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

export function resolveServerModelCapabilities(model: string): CutieServerCapabilityProfile {
  const normalized = String(model || "").trim();
  for (const candidate of PROFILES) {
    if (candidate.pattern.test(normalized)) {
      return candidate.profile;
    }
  }
  return DEFAULT_PROFILE;
}

export function resolveServerProtocolMode(input: {
  requestedMode?: CutieServerProtocolMode;
  capabilities: CutieServerCapabilityProfile;
}): CutieServerProtocolMode {
  if (input.requestedMode === "final_only") return "final_only";
  if (input.requestedMode === "text_extraction") return "text_extraction";
  if (input.capabilities.nativeTools === "reliable") return "native_tools";
  return input.capabilities.textExtractionFallback ? "text_extraction" : "native_tools";
}

export function resolveServerMaxToolsPerBatch(input: {
  requested: number;
  capabilities: CutieServerCapabilityProfile;
}): number {
  void input;
  return 1;
}
