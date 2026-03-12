export type PlaygroundModelProvider = "hf" | "nvidia";

export type PlaygroundModelCapabilitySet = {
  maxContextTokens: number;
  supportsStreaming: boolean;
  supportsReasoningStream: boolean;
  supportsImages: boolean;
  supportsNativeTools: boolean;
  supportsTextActions: boolean;
  supportsUnifiedDiff: boolean;
  supportsWriteFile: boolean;
  supportsMkdir: boolean;
  supportsShellCommands: boolean;
};

export type PlaygroundModelCertification = "tool_ready" | "chat_only" | "experimental";

export type PlaygroundModelRegistryEntry = {
  alias: string;
  displayName: string;
  description: string;
  provider: PlaygroundModelProvider;
  model: string;
  fallbackAliases: string[];
  capabilities: PlaygroundModelCapabilitySet;
  certification: PlaygroundModelCertification;
  enabled: boolean;
};

export type PlaygroundModelRequirementSet = Partial<{
  images: boolean;
  nativeTools: boolean;
  textActions: boolean;
  shellCommands: boolean;
  toolReady: boolean;
}>;

export type PlaygroundResolvedModelSelection = {
  requested: string;
  requestedAlias: string;
  resolvedAlias: string;
  resolvedEntry: PlaygroundModelRegistryEntry;
  fallbackChain: PlaygroundModelRegistryEntry[];
};

export const PLAYGROUND_CONTRACT_VERSION = "2026-03-actions-v1";
export const DEFAULT_PLAYGROUND_MODEL_ALIAS = "playground-default";
export const BACKUP_PLAYGROUND_MODEL_ALIAS = "playground-backup";

const LONG_CONTEXT_CAP = 262_144;

const MODEL_REGISTRY: PlaygroundModelRegistryEntry[] = [
  {
    alias: DEFAULT_PLAYGROUND_MODEL_ALIAS,
    displayName: "Playground Default",
    description: "Primary text-contract coding model for production use.",
    provider: "hf",
    model: "openai/gpt-oss-120b:fastest",
    fallbackAliases: [BACKUP_PLAYGROUND_MODEL_ALIAS],
    capabilities: {
      maxContextTokens: LONG_CONTEXT_CAP,
      supportsStreaming: true,
      supportsReasoningStream: true,
      supportsImages: true,
      supportsNativeTools: false,
      supportsTextActions: true,
      supportsUnifiedDiff: true,
      supportsWriteFile: true,
      supportsMkdir: true,
      supportsShellCommands: true,
    },
    certification: "tool_ready",
    enabled: true,
  },
  {
    alias: BACKUP_PLAYGROUND_MODEL_ALIAS,
    displayName: "Playground Backup",
    description: "Fallback production model for coding and repair passes.",
    provider: "nvidia",
    model: "mistralai/mistral-nemotron",
    fallbackAliases: [DEFAULT_PLAYGROUND_MODEL_ALIAS],
    capabilities: {
      maxContextTokens: 128_000,
      supportsStreaming: true,
      supportsReasoningStream: true,
      supportsImages: false,
      supportsNativeTools: false,
      supportsTextActions: true,
      supportsUnifiedDiff: true,
      supportsWriteFile: true,
      supportsMkdir: true,
      supportsShellCommands: true,
    },
    certification: "tool_ready",
    enabled: true,
  },
  {
    alias: "playground-native-preview",
    displayName: "Playground Native Tools Preview",
    description: "Experimental native-tools adapter target for compatibility testing.",
    provider: "hf",
    model: "openai/gpt-oss-120b:fastest",
    fallbackAliases: [DEFAULT_PLAYGROUND_MODEL_ALIAS, BACKUP_PLAYGROUND_MODEL_ALIAS],
    capabilities: {
      maxContextTokens: LONG_CONTEXT_CAP,
      supportsStreaming: false,
      supportsReasoningStream: false,
      supportsImages: false,
      supportsNativeTools: true,
      supportsTextActions: true,
      supportsUnifiedDiff: true,
      supportsWriteFile: true,
      supportsMkdir: true,
      supportsShellCommands: true,
    },
    certification: "experimental",
    enabled: true,
  },
];

function normalizeKey(input: string | undefined): string {
  return String(input || "").trim().toLowerCase();
}

function entryMatchesRequested(entry: PlaygroundModelRegistryEntry, requested: string): boolean {
  const needle = normalizeKey(requested);
  if (!needle) return false;
  return normalizeKey(entry.alias) === needle || normalizeKey(entry.model) === needle || normalizeKey(entry.displayName) === needle;
}

function meetsRequirements(
  entry: PlaygroundModelRegistryEntry,
  requirements: PlaygroundModelRequirementSet | undefined
): boolean {
  if (!entry.enabled) return false;
  if (!requirements) return true;
  if (requirements.images && !entry.capabilities.supportsImages) return false;
  if (requirements.nativeTools && !entry.capabilities.supportsNativeTools) return false;
  if (requirements.textActions && !entry.capabilities.supportsTextActions) return false;
  if (requirements.shellCommands && !entry.capabilities.supportsShellCommands) return false;
  if (requirements.toolReady && entry.certification !== "tool_ready") return false;
  return true;
}

function collectFallbackChain(seed: PlaygroundModelRegistryEntry): PlaygroundModelRegistryEntry[] {
  const byAlias = new Map(MODEL_REGISTRY.map((entry) => [normalizeKey(entry.alias), entry] as const));
  const out: PlaygroundModelRegistryEntry[] = [];
  const queue = [seed.alias, ...seed.fallbackAliases, DEFAULT_PLAYGROUND_MODEL_ALIAS, BACKUP_PLAYGROUND_MODEL_ALIAS];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const alias = normalizeKey(queue.shift());
    if (!alias || seen.has(alias)) continue;
    seen.add(alias);
    const entry = byAlias.get(alias);
    if (!entry) continue;
    out.push(entry);
    for (const next of entry.fallbackAliases) {
      const normalizedNext = normalizeKey(next);
      if (normalizedNext && !seen.has(normalizedNext)) queue.push(normalizedNext);
    }
  }
  return out;
}

export function listPlaygroundModels(): PlaygroundModelRegistryEntry[] {
  return MODEL_REGISTRY.map((entry) => ({
    ...entry,
    fallbackAliases: [...entry.fallbackAliases],
    capabilities: { ...entry.capabilities },
  }));
}

export function getPlaygroundModelEntry(requested: string | undefined): PlaygroundModelRegistryEntry | null {
  const key = normalizeKey(requested);
  if (!key) return null;
  return MODEL_REGISTRY.find((entry) => entryMatchesRequested(entry, key)) ?? null;
}

export function resolvePlaygroundModelSelection(input: {
  requested?: string;
  requirements?: PlaygroundModelRequirementSet;
  allowedProviders?: PlaygroundModelProvider[];
}): PlaygroundResolvedModelSelection {
  const requested = String(input.requested || "").trim() || DEFAULT_PLAYGROUND_MODEL_ALIAS;
  const requestedEntry = getPlaygroundModelEntry(requested) ?? getPlaygroundModelEntry(DEFAULT_PLAYGROUND_MODEL_ALIAS) ?? MODEL_REGISTRY[0];
  const allowedProviders = new Set((input.allowedProviders ?? []).map((provider) => provider));
  const providerFiltered = collectFallbackChain(requestedEntry).filter((entry) => {
    if (!allowedProviders.size) return true;
    return allowedProviders.has(entry.provider);
  });
  const capabilityFiltered = providerFiltered.filter((entry) => meetsRequirements(entry, input.requirements));
  const resolvedEntry = capabilityFiltered[0] ?? providerFiltered[0] ?? requestedEntry;
  return {
    requested,
    requestedAlias: requestedEntry.alias,
    resolvedAlias: resolvedEntry.alias,
    resolvedEntry,
    fallbackChain: capabilityFiltered.length > 0 ? capabilityFiltered : providerFiltered.length > 0 ? providerFiltered : [requestedEntry],
  };
}

export function serializePlaygroundModelEntry(entry: PlaygroundModelRegistryEntry) {
  return {
    alias: entry.alias,
    displayName: entry.displayName,
    description: entry.description,
    provider: entry.provider,
    model: entry.model,
    fallbackAliases: [...entry.fallbackAliases],
    capabilities: { ...entry.capabilities },
    certification: entry.certification,
    enabled: entry.enabled,
    contractVersion: PLAYGROUND_CONTRACT_VERSION,
  };
}
