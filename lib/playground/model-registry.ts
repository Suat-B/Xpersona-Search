export type PlaygroundModelProvider =
  | "hf"
  | "openai_compatible"
  | "openai"
  | "qwen_dashscope"
  | "openrouter"
  | "anthropic"
  | "gemini"
  | "groq"
  | "github_models"
  | "azure_openai"
  | "vertex_ai";
export type PlaygroundModelAdapter = "native_tools" | "text_actions" | "deterministic_batch";
export type PlaygroundModelAuthSource =
  | "hf_token"
  | "openai_api_key"
  | "playground_model_api_key"
  | "user_connected"
  | "none";
export type PlaygroundToolName =
  | "list_files"
  | "read_file"
  | "search_workspace"
  | "get_diagnostics"
  | "git_status"
  | "git_diff"
  | "create_checkpoint"
  | "edit"
  | "write_file"
  | "mkdir"
  | "run_command"
  | "get_workspace_memory"
  | "binary_start_build"
  | "binary_refine_build"
  | "binary_cancel_build"
  | "binary_branch_build"
  | "binary_rewind_build"
  | "binary_validate_build"
  | "binary_execute_build"
  | "binary_publish_build"
  | "desktop_capture_screen"
  | "desktop_list_apps"
  | "desktop_get_active_window"
  | "desktop_list_windows"
  | "desktop_open_app"
  | "desktop_open_url"
  | "desktop_focus_window"
  | "desktop_click"
  | "desktop_type"
  | "desktop_keypress"
  | "desktop_scroll"
  | "desktop_wait"
  | "world_get_summary"
  | "world_get_active_context"
  | "world_query_graph"
  | "world_get_neighbors"
  | "world_get_recent_changes"
  | "world_get_route_stats"
  | "world_get_affordances"
  | "world_find_routine"
  | "world_record_observation"
  | "world_record_proof"
  | "world_commit_memory"
  | "world_record_route_outcome"
  | "world_score_route"
  | "repo_get_summary"
  | "repo_query_symbols"
  | "repo_find_references"
  | "repo_get_change_impact"
  | "repo_get_validation_plan"
  | "repo_record_verification";

export type PlaygroundModelCapabilitySet = {
  maxContextTokens: number;
  supportsStreaming: boolean;
  supportsTextActions: boolean;
  supportsUnifiedDiff: boolean;
  supportsWriteFile: boolean;
  supportsMkdir: boolean;
  supportsShellCommands: boolean;
  supportsToolLoop: boolean;
  supportsNativeToolCalls: boolean;
  preferredAdapter: PlaygroundModelAdapter;
  supportedTools: PlaygroundToolName[];
};

export type PlaygroundModelCertification = "tool_ready";
export type PlaygroundModelOpenHandsProfile = "full" | "code-only" | "chat-only";

export type PlaygroundModelOpenHandsCompatibility = {
  compatible: boolean;
  providerModel?: string;
  fallbackAliases: string[];
  runtimeProfile: PlaygroundModelOpenHandsProfile;
};

export type PlaygroundModelRegistryEntry = {
  alias: string;
  displayName: string;
  description: string;
  provider: PlaygroundModelProvider;
  model: string;
  baseUrl: string;
  authSource: PlaygroundModelAuthSource;
  capabilities: PlaygroundModelCapabilitySet;
  certification: PlaygroundModelCertification;
  openhands: PlaygroundModelOpenHandsCompatibility;
  enabled: boolean;
  runtimeApiKey?: string | null;
  modelSource?: "platform" | "user_connected";
  routeKind?: string;
  routeLabel?: string;
  routeReason?: string;
  modelFamilies?: string[];
  extraHeaders?: Record<string, string>;
};

export type PlaygroundUserConnectedModelCandidate = {
  alias: string;
  provider: string;
  displayName: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  routeKind?: string;
  routeLabel?: string;
  routeReason?: string;
  modelFamilies?: string[];
  extraHeaders?: Record<string, string>;
  authSource?: "user_connected";
  candidateSource?: "user_connected";
  preferred?: boolean;
  latencyTier?: "fast" | "balanced" | "thorough";
  reasoningDefault?: "low" | "medium" | "high";
  intendedUse?: "chat" | "action" | "repair";
};

export type PlaygroundResolvedModelSelection = {
  requested: string;
  requestedAlias: string;
  resolvedAlias: string;
  resolvedEntry: PlaygroundModelRegistryEntry;
  fallbackChain: PlaygroundModelRegistryEntry[];
};

export const PLAYGROUND_CONTRACT_VERSION = "2026-03-minimal-coding-v1";
export const DEFAULT_PLAYGROUND_MODEL_ALIAS =
  String(process.env.PLAYGROUND_DEFAULT_MODEL_ALIAS || "kimi-k2").trim() || "kimi-k2";
export const PLAYGROUND_TOOL_LOOP_TOOLS: PlaygroundToolName[] = [
  "list_files",
  "read_file",
  "search_workspace",
  "get_diagnostics",
  "git_status",
  "git_diff",
  "create_checkpoint",
  "edit",
  "write_file",
  "mkdir",
  "run_command",
  "get_workspace_memory",
  "binary_start_build",
  "binary_refine_build",
  "binary_cancel_build",
  "binary_branch_build",
  "binary_rewind_build",
  "binary_validate_build",
  "binary_execute_build",
  "binary_publish_build",
  "desktop_capture_screen",
  "desktop_list_apps",
  "desktop_get_active_window",
  "desktop_list_windows",
  "desktop_open_app",
  "desktop_open_url",
  "desktop_focus_window",
  "desktop_click",
  "desktop_type",
  "desktop_keypress",
  "desktop_scroll",
  "desktop_wait",
  "world_get_summary",
  "world_get_active_context",
  "world_query_graph",
  "world_get_neighbors",
  "world_get_recent_changes",
  "world_get_route_stats",
  "world_get_affordances",
  "world_find_routine",
  "world_record_observation",
  "world_record_proof",
  "world_commit_memory",
  "world_record_route_outcome",
  "world_score_route",
  "repo_get_summary",
  "repo_query_symbols",
  "repo_find_references",
  "repo_get_change_impact",
  "repo_get_validation_plan",
  "repo_record_verification",
];

type PlaygroundModelRegistryEntryInput = {
  alias: string;
  displayName?: string;
  description?: string;
  provider?: PlaygroundModelProvider;
  model?: string;
  baseUrl?: string;
  authSource?: PlaygroundModelAuthSource;
  capabilities?: Partial<PlaygroundModelCapabilitySet>;
  openhands?: Partial<PlaygroundModelOpenHandsCompatibility>;
  enabled?: boolean;
  runtimeApiKey?: string | null;
  modelSource?: "platform" | "user_connected";
  routeKind?: string;
  routeLabel?: string;
  routeReason?: string;
  modelFamilies?: string[];
  extraHeaders?: Record<string, string>;
};

const DEFAULT_CAPABILITIES: PlaygroundModelCapabilitySet = {
  maxContextTokens: 128_000,
  supportsStreaming: true,
  supportsTextActions: true,
  supportsUnifiedDiff: true,
  supportsWriteFile: true,
  supportsMkdir: true,
  supportsShellCommands: true,
  supportsToolLoop: true,
  supportsNativeToolCalls: false,
  preferredAdapter: "text_actions",
  supportedTools: [...PLAYGROUND_TOOL_LOOP_TOOLS],
};

const DEFAULT_MODEL_ENTRY: PlaygroundModelRegistryEntry = buildRegistryEntry({
  alias: DEFAULT_PLAYGROUND_MODEL_ALIAS,
  displayName: "Kimi K2",
  description: "Default hosted autonomy and coding model, resolved through the shared active alias path.",
  provider: (String(process.env.PLAYGROUND_KIMI_PROVIDER || "hf").trim() as PlaygroundModelProvider) || "hf",
  model: String(process.env.PLAYGROUND_KIMI_MODEL || process.env.PLAYGROUND_DEFAULT_MODEL || "moonshotai/Kimi-K2-Instruct").trim(),
  baseUrl: String(
    process.env.PLAYGROUND_KIMI_BASE_URL || process.env.PLAYGROUND_DEFAULT_BASE_URL || "https://router.huggingface.co/v1"
  ).trim(),
  authSource: (String(process.env.PLAYGROUND_KIMI_AUTH_SOURCE || "hf_token").trim() as PlaygroundModelAuthSource) || "hf_token",
  capabilities: {
    supportsTextActions: true,
    supportsNativeToolCalls: false,
    preferredAdapter: "text_actions",
  },
  openhands: {
    compatible: false,
    providerModel: String(process.env.PLAYGROUND_KIMI_OPENHANDS_MODEL || "").trim() || undefined,
    fallbackAliases: ["qwen-coder-32b", "qwen-next"],
    runtimeProfile: "code-only",
  },
  enabled: true,
});

const BUILTIN_MODEL_ENTRIES: PlaygroundModelRegistryEntry[] = [
  DEFAULT_MODEL_ENTRY,
  buildRegistryEntry({
    alias: "playground-default",
    displayName: "Kimi K2 (Compatibility)",
    description: "Compatibility alias that resolves to the current server-owned default model.",
    provider: DEFAULT_MODEL_ENTRY.provider,
    model: DEFAULT_MODEL_ENTRY.model,
    baseUrl: DEFAULT_MODEL_ENTRY.baseUrl,
    authSource: DEFAULT_MODEL_ENTRY.authSource,
    capabilities: {
      ...DEFAULT_MODEL_ENTRY.capabilities,
    },
    openhands: {
      ...DEFAULT_MODEL_ENTRY.openhands,
    },
    enabled: true,
  }),
  buildRegistryEntry({
    alias: "kimi",
    displayName: "Kimi K2",
    description: "First-class Kimi alias for OpenHands-driven coding and PC autonomy.",
    provider: DEFAULT_MODEL_ENTRY.provider,
    model: DEFAULT_MODEL_ENTRY.model,
    baseUrl: DEFAULT_MODEL_ENTRY.baseUrl,
    authSource: DEFAULT_MODEL_ENTRY.authSource,
    capabilities: {
      ...DEFAULT_MODEL_ENTRY.capabilities,
    },
    openhands: {
      ...DEFAULT_MODEL_ENTRY.openhands,
    },
    enabled: true,
  }),
  buildRegistryEntry({
    alias: "qwen-coder-32b",
    displayName: "Qwen 2.5 Coder 32B",
    description: "Qwen 2.5 Coder on Hugging Face Router (previous default).",
    provider: "hf",
    model: String(process.env.PLAYGROUND_QWEN_CODER_MODEL || "Qwen/Qwen2.5-Coder-32B-Instruct:fastest").trim(),
    baseUrl: String(process.env.PLAYGROUND_QWEN_CODER_BASE_URL || "https://router.huggingface.co/v1").trim(),
    authSource: "hf_token",
    capabilities: {
      supportsTextActions: true,
      supportsNativeToolCalls: false,
      preferredAdapter: "text_actions",
    },
    openhands: {
      compatible: true,
      providerModel: String(
        process.env.PLAYGROUND_QWEN_CODER_OPENHANDS_MODEL || "huggingface/Qwen/Qwen2.5-Coder-32B-Instruct:fastest"
      ).trim(),
      fallbackAliases: ["qwen-next"],
      runtimeProfile: "code-only",
    },
    enabled: true,
  }),
  buildRegistryEntry({
    alias: "qwen-next",
    displayName: "Qwen Next",
    description: "Legacy Qwen Code runtime model exposed as a hosted alias for migration.",
    provider: "hf",
    model: String(process.env.PLAYGROUND_QWEN_MODEL || "Qwen/Qwen3-Next-80B-A3B-Thinking:fastest").trim(),
    baseUrl: String(process.env.PLAYGROUND_QWEN_BASE_URL || "https://router.huggingface.co/v1").trim(),
    authSource: "hf_token",
    capabilities: {
      supportsTextActions: true,
      supportsNativeToolCalls: false,
      preferredAdapter: "text_actions",
    },
    openhands: {
      compatible: true,
      providerModel: String(
        process.env.PLAYGROUND_QWEN_NEXT_OPENHANDS_MODEL || "huggingface/Qwen/Qwen3-Next-80B-A3B-Thinking:fastest"
      ).trim(),
      fallbackAliases: ["qwen-coder-32b"],
      runtimeProfile: "code-only",
    },
    enabled: true,
  }),
];

function normalizeBaseUrl(value: string): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

function buildRegistryEntry(input: PlaygroundModelRegistryEntryInput): PlaygroundModelRegistryEntry {
  return {
    alias: String(input.alias || "").trim(),
    displayName: String(input.displayName || input.alias || "Model").trim(),
    description: String(input.description || "Hosted coding model").trim(),
    provider: input.provider || "hf",
    model: String(input.model || "").trim(),
    baseUrl: normalizeBaseUrl(input.baseUrl || "https://router.huggingface.co/v1"),
    authSource: input.authSource || "hf_token",
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      ...(input.capabilities || {}),
      supportedTools: Array.isArray(input.capabilities?.supportedTools)
        ? [...input.capabilities.supportedTools]
        : [...DEFAULT_CAPABILITIES.supportedTools],
    },
    certification: "tool_ready",
    openhands: {
      compatible: input.openhands?.compatible ?? true,
      providerModel: String(input.openhands?.providerModel || input.model || "").trim() || undefined,
      fallbackAliases: Array.isArray(input.openhands?.fallbackAliases) ? [...input.openhands.fallbackAliases] : [],
      runtimeProfile: input.openhands?.runtimeProfile || "code-only",
    },
    enabled: input.enabled !== false,
    runtimeApiKey: input.runtimeApiKey || null,
    modelSource: input.modelSource || "platform",
    ...(input.routeKind ? { routeKind: input.routeKind } : {}),
    ...(input.routeLabel ? { routeLabel: input.routeLabel } : {}),
    ...(input.routeReason ? { routeReason: input.routeReason } : {}),
    ...(Array.isArray(input.modelFamilies) && input.modelFamilies.length ? { modelFamilies: [...input.modelFamilies] } : {}),
    ...(input.extraHeaders && Object.keys(input.extraHeaders).length ? { extraHeaders: { ...input.extraHeaders } } : {}),
  };
}

function cloneEntry(entry: PlaygroundModelRegistryEntry): PlaygroundModelRegistryEntry {
  return {
    ...entry,
    capabilities: {
      ...entry.capabilities,
      supportedTools: [...entry.capabilities.supportedTools],
    },
    openhands: {
      ...entry.openhands,
      fallbackAliases: [...entry.openhands.fallbackAliases],
    },
    ...(Array.isArray(entry.modelFamilies) ? { modelFamilies: [...entry.modelFamilies] } : {}),
    ...(entry.extraHeaders ? { extraHeaders: { ...entry.extraHeaders } } : {}),
  };
}

function parseEnvRegistry(): PlaygroundModelRegistryEntry[] {
  const raw = String(process.env.PLAYGROUND_MODEL_REGISTRY_JSON || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is PlaygroundModelRegistryEntryInput => Boolean(entry && typeof entry === "object"))
      .map((entry) => buildRegistryEntry(entry))
      .filter((entry) => Boolean(entry.alias && entry.model));
  } catch {
    return [];
  }
}

function buildUserConnectedEntries(
  userConnectedModels?: PlaygroundUserConnectedModelCandidate[]
): PlaygroundModelRegistryEntry[] {
  return (Array.isArray(userConnectedModels) ? userConnectedModels : [])
    .filter((candidate) => candidate && typeof candidate === "object")
    .map((candidate) =>
      buildRegistryEntry({
        alias: String(candidate.alias || "").trim(),
        displayName: String(candidate.displayName || candidate.provider || candidate.alias || "Connected model").trim(),
        description: "User-connected model resolved from Binary Host local provider storage.",
        provider: (String(candidate.provider || "openai_compatible").trim() as PlaygroundModelProvider) || "openai_compatible",
        model: String(candidate.model || "").trim(),
        baseUrl: String(candidate.baseUrl || "").trim(),
        authSource: "user_connected",
        capabilities: {
          supportsTextActions: true,
          supportsNativeToolCalls: false,
          preferredAdapter: "text_actions",
        },
        openhands: {
          compatible: true,
          providerModel: String(candidate.model || "").trim(),
          fallbackAliases: [],
          runtimeProfile: "code-only",
        },
        enabled: true,
        runtimeApiKey: String(candidate.apiKey || "").trim() || null,
        modelSource: "user_connected",
        routeKind: String(candidate.routeKind || "").trim() || undefined,
        routeLabel: String(candidate.routeLabel || "").trim() || undefined,
        routeReason: String(candidate.routeReason || "").trim() || undefined,
        modelFamilies: Array.isArray(candidate.modelFamilies) ? candidate.modelFamilies : undefined,
        extraHeaders: candidate.extraHeaders,
      })
    )
    .filter((entry) => Boolean(entry.alias && entry.model && entry.runtimeApiKey));
}

function dedupeByAlias(entries: PlaygroundModelRegistryEntry[]): PlaygroundModelRegistryEntry[] {
  const seen = new Set<string>();
  const out: PlaygroundModelRegistryEntry[] = [];
  for (const entry of entries) {
    const alias = String(entry.alias || "").trim();
    if (!alias || seen.has(alias)) continue;
    seen.add(alias);
    out.push(cloneEntry(entry));
  }
  return out;
}

function getRegistryEntries(input?: {
  userConnectedModels?: PlaygroundUserConnectedModelCandidate[];
}): PlaygroundModelRegistryEntry[] {
  return dedupeByAlias([
    ...buildUserConnectedEntries(input?.userConnectedModels),
    ...BUILTIN_MODEL_ENTRIES,
    ...parseEnvRegistry(),
  ]).filter((entry) => entry.enabled);
}

function findByRequestedValue(entries: PlaygroundModelRegistryEntry[], requested: string): PlaygroundModelRegistryEntry | null {
  const normalizedRequested = String(requested || "").trim().toLowerCase();
  if (!normalizedRequested) return null;
  return (
    entries.find((entry) => entry.alias.toLowerCase() === normalizedRequested) ||
    entries.find((entry) => entry.provider.toLowerCase() === normalizedRequested && entry.authSource === "user_connected") ||
    entries.find(
      (entry) =>
        entry.authSource === "user_connected" &&
        Array.isArray(entry.modelFamilies) &&
        entry.modelFamilies.some((family) => family.toLowerCase() === normalizedRequested)
    ) ||
    entries.find((entry) => entry.model.toLowerCase() === normalizedRequested) ||
    null
  );
}

export function getDefaultPlaygroundModelEntry(): PlaygroundModelRegistryEntry {
  return cloneEntry(getRegistryEntries()[0] || DEFAULT_MODEL_ENTRY);
}

export function listPlaygroundModels(): PlaygroundModelRegistryEntry[] {
  return getRegistryEntries().map((entry) => cloneEntry(entry));
}

export function listPublicPlaygroundModels(): PlaygroundModelRegistryEntry[] {
  return listPlaygroundModels();
}

export function getPlaygroundModelEntry(requested?: string): PlaygroundModelRegistryEntry {
  const entries = getRegistryEntries();
  const matched = findByRequestedValue(entries, String(requested || "").trim());
  return cloneEntry(matched || entries[0] || DEFAULT_MODEL_ENTRY);
}

export function resolvePlaygroundModelSelection(input?: {
  requested?: string;
  userConnectedModels?: PlaygroundUserConnectedModelCandidate[];
}): PlaygroundResolvedModelSelection {
  const requested = String(input?.requested || DEFAULT_PLAYGROUND_MODEL_ALIAS).trim() || DEFAULT_PLAYGROUND_MODEL_ALIAS;
  const entries = getRegistryEntries({ userConnectedModels: input?.userConnectedModels });
  const userConnectedEntries = entries.filter((entry) => entry.authSource === "user_connected");
  const preferredUserEntry = (() => {
    const preferredAliases = new Set(
      (Array.isArray(input?.userConnectedModels) ? input?.userConnectedModels : [])
        .filter((candidate) => candidate.preferred)
        .map((candidate) => String(candidate.alias || "").trim())
        .filter(Boolean)
    );
    return (
      userConnectedEntries.find((entry) => preferredAliases.has(entry.alias)) ||
      userConnectedEntries[0] ||
      null
    );
  })();
  const defaultEntry = preferredUserEntry || entries[0] || DEFAULT_MODEL_ENTRY;
  const matched = findByRequestedValue(entries, requested);
  const requestLooksLikePlatformDefault =
    !requested ||
    requested === DEFAULT_PLAYGROUND_MODEL_ALIAS ||
    requested.toLowerCase() === "binary ide" ||
    requested.toLowerCase() === "playground-default";
  const resolvedEntry = matched || (requestLooksLikePlatformDefault ? defaultEntry : defaultEntry);
  const orderedUserFallbackAliases =
    resolvedEntry.authSource === "user_connected"
      ? userConnectedEntries
          .filter((entry) => entry.alias !== resolvedEntry.alias)
          .map((entry) => entry.alias)
      : [];
  const fallbackAliases = [
    ...resolvedEntry.openhands.fallbackAliases,
    ...orderedUserFallbackAliases,
    ...(preferredUserEntry && preferredUserEntry.alias !== resolvedEntry.alias ? [preferredUserEntry.alias] : []),
    defaultEntry.alias !== resolvedEntry.alias ? defaultEntry.alias : "",
  ].filter(Boolean);
  const fallbackChain = fallbackAliases
    .map((alias) => findByRequestedValue(entries, alias))
    .filter((entry): entry is PlaygroundModelRegistryEntry => Boolean(entry))
    .map((entry) => cloneEntry(entry));
  return {
    requested,
    requestedAlias: requested,
    resolvedAlias: resolvedEntry.alias,
    resolvedEntry: cloneEntry(resolvedEntry),
    fallbackChain: fallbackChain.length > 0 ? fallbackChain : [cloneEntry(defaultEntry)],
  };
}

export function resolvePlaygroundModelToken(entry: PlaygroundModelRegistryEntry): string | null {
  if (entry.authSource === "user_connected") {
    return String(entry.runtimeApiKey || "").trim() || null;
  }
  switch (entry.authSource) {
    case "hf_token": {
      const token =
        process.env.HF_ROUTER_TOKEN ||
        process.env.HF_TOKEN ||
        process.env.HUGGINGFACE_TOKEN ||
        "";
      return token.trim() || null;
    }
    case "openai_api_key":
      return String(process.env.OPENAI_API_KEY || "").trim() || null;
    case "playground_model_api_key":
      return String(process.env.PLAYGROUND_MODEL_API_KEY || "").trim() || null;
    default:
      return null;
  }
}

export function serializePlaygroundModelEntry(entry: PlaygroundModelRegistryEntry) {
  return {
    alias: entry.alias,
    displayName: entry.displayName,
    description: entry.description,
    provider: entry.provider,
    model: entry.model,
    baseUrl: entry.baseUrl,
    authSource: entry.authSource,
    capabilities: { ...entry.capabilities, supportedTools: [...entry.capabilities.supportedTools] },
    certification: entry.certification,
    openhands: {
      ...entry.openhands,
      fallbackAliases: [...entry.openhands.fallbackAliases],
    },
    enabled: entry.enabled,
    modelSource: entry.modelSource || "platform",
    contractVersion: PLAYGROUND_CONTRACT_VERSION,
  };
}
