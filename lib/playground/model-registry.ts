export type PlaygroundModelProvider = "hf" | "openai_compatible";
export type PlaygroundModelAdapter = "native_tools" | "text_actions" | "deterministic_batch";
export type PlaygroundModelAuthSource = "hf_token" | "openai_api_key" | "playground_model_api_key" | "none";
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
  | "desktop_capture_screen"
  | "desktop_get_active_window"
  | "desktop_list_windows"
  | "desktop_open_app"
  | "desktop_open_url"
  | "desktop_focus_window"
  | "desktop_click"
  | "desktop_type"
  | "desktop_keypress"
  | "desktop_scroll"
  | "desktop_wait";

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
  enabled: boolean;
};

export type PlaygroundResolvedModelSelection = {
  requested: string;
  requestedAlias: string;
  resolvedAlias: string;
  resolvedEntry: PlaygroundModelRegistryEntry;
  fallbackChain: PlaygroundModelRegistryEntry[];
};

export const PLAYGROUND_CONTRACT_VERSION = "2026-03-minimal-coding-v1";
export const DEFAULT_PLAYGROUND_MODEL_ALIAS = "playground-default";
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
  "desktop_capture_screen",
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
  enabled?: boolean;
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
  displayName: "Cutie Default",
  description: "Server-owned default coding model for the hosted Binary IDE runtime.",
  provider: "hf",
  model: String(process.env.PLAYGROUND_DEFAULT_MODEL || "Qwen/Qwen2.5-Coder-32B-Instruct:fastest").trim(),
  baseUrl: String(process.env.PLAYGROUND_DEFAULT_BASE_URL || "https://router.huggingface.co/v1").trim(),
  authSource: "hf_token",
  capabilities: {
    supportsTextActions: true,
    supportsNativeToolCalls: false,
    preferredAdapter: "text_actions",
  },
  enabled: true,
});

const BUILTIN_MODEL_ENTRIES: PlaygroundModelRegistryEntry[] = [
  DEFAULT_MODEL_ENTRY,
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
    enabled: input.enabled !== false,
  };
}

function cloneEntry(entry: PlaygroundModelRegistryEntry): PlaygroundModelRegistryEntry {
  return {
    ...entry,
    capabilities: {
      ...entry.capabilities,
      supportedTools: [...entry.capabilities.supportedTools],
    },
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

function getRegistryEntries(): PlaygroundModelRegistryEntry[] {
  return dedupeByAlias([...BUILTIN_MODEL_ENTRIES, ...parseEnvRegistry()]).filter((entry) => entry.enabled);
}

function findByRequestedValue(entries: PlaygroundModelRegistryEntry[], requested: string): PlaygroundModelRegistryEntry | null {
  const normalizedRequested = String(requested || "").trim().toLowerCase();
  if (!normalizedRequested) return null;
  return (
    entries.find((entry) => entry.alias.toLowerCase() === normalizedRequested) ||
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
}): PlaygroundResolvedModelSelection {
  const requested = String(input?.requested || DEFAULT_PLAYGROUND_MODEL_ALIAS).trim() || DEFAULT_PLAYGROUND_MODEL_ALIAS;
  const entries = getRegistryEntries();
  const defaultEntry = entries[0] || DEFAULT_MODEL_ENTRY;
  const matched = findByRequestedValue(entries, requested);
  const resolvedEntry = matched || defaultEntry;
  return {
    requested,
    requestedAlias: requested,
    resolvedAlias: resolvedEntry.alias,
    resolvedEntry: cloneEntry(resolvedEntry),
    fallbackChain: [cloneEntry(defaultEntry)],
  };
}

export function resolvePlaygroundModelToken(entry: PlaygroundModelRegistryEntry): string | null {
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
    enabled: entry.enabled,
    contractVersion: PLAYGROUND_CONTRACT_VERSION,
  };
}
