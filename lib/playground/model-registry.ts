export type PlaygroundModelProvider = "hf";
export type PlaygroundModelAdapter = "native_tools" | "text_actions" | "deterministic_batch";
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
  | "get_workspace_memory";

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
];

const DEFAULT_MODEL_ENTRY: PlaygroundModelRegistryEntry = {
  alias: DEFAULT_PLAYGROUND_MODEL_ALIAS,
  displayName: "Playground",
  description: "Server-owned default coding model for the minimal Playground agent loop.",
  provider: "hf",
  model: String(process.env.PLAYGROUND_DEFAULT_MODEL || "Qwen/Qwen2.5-Coder-7B-Instruct:fastest").trim(),
  capabilities: {
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
  },
  certification: "tool_ready",
  enabled: true,
};

function cloneEntry(entry: PlaygroundModelRegistryEntry): PlaygroundModelRegistryEntry {
  return {
    ...entry,
    capabilities: { ...entry.capabilities },
  };
}

export function getDefaultPlaygroundModelEntry(): PlaygroundModelRegistryEntry {
  return cloneEntry(DEFAULT_MODEL_ENTRY);
}

export function listPlaygroundModels(): PlaygroundModelRegistryEntry[] {
  return [getDefaultPlaygroundModelEntry()];
}

export function listPublicPlaygroundModels(): PlaygroundModelRegistryEntry[] {
  return listPlaygroundModels();
}

export function getPlaygroundModelEntry(_requested?: string): PlaygroundModelRegistryEntry {
  return getDefaultPlaygroundModelEntry();
}

export function resolvePlaygroundModelSelection(input?: {
  requested?: string;
}): PlaygroundResolvedModelSelection {
  const requested = String(input?.requested || DEFAULT_PLAYGROUND_MODEL_ALIAS).trim() || DEFAULT_PLAYGROUND_MODEL_ALIAS;
  const resolvedEntry = getDefaultPlaygroundModelEntry();
  return {
    requested,
    requestedAlias: DEFAULT_PLAYGROUND_MODEL_ALIAS,
    resolvedAlias: DEFAULT_PLAYGROUND_MODEL_ALIAS,
    resolvedEntry,
    fallbackChain: [resolvedEntry],
  };
}

export function serializePlaygroundModelEntry(entry: PlaygroundModelRegistryEntry) {
  return {
    alias: entry.alias,
    displayName: entry.displayName,
    description: entry.description,
    provider: entry.provider,
    model: entry.model,
    capabilities: { ...entry.capabilities },
    certification: entry.certification,
    enabled: entry.enabled,
    contractVersion: PLAYGROUND_CONTRACT_VERSION,
  };
}
