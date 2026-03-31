import {
  getUserPlaygroundProfile,
  getPlaygroundProviderConnectionByAlias,
  listPlaygroundProviderConnections,
  type PlaygroundProviderConnectionRecord,
} from "@/lib/playground/store";
import { decryptSecretPayload, encryptSecretPayload } from "@/lib/security/encrypted-secrets";
import {
  DEFAULT_PLAYGROUND_MODEL_ALIAS,
  resolvePlaygroundModelSelection,
  resolvePlaygroundModelToken,
  type PlaygroundModelCapabilitySet,
  type PlaygroundModelCertification,
  type PlaygroundModelProvider,
} from "@/lib/playground/model-registry";

export type PlaygroundChatModelSource = "platform" | "user_connected";
export type PlaygroundOrchestratorModelSource = "platform_owned" | "user_connected";
export type PlaygroundInteractionKind = "chat" | "repo_code";

export type ProviderConnectionSecret =
  | { authMode: "api_key"; apiKey: string }
  | { authMode: "browser_auth"; accessToken?: string; refreshToken?: string; accountEmail?: string };

export type UserConnectedModelSummary = {
  id: string;
  provider: string;
  alias: string;
  displayName: string;
  authMode: string;
  baseUrl: string | null;
  defaultModel: string | null;
  status: string;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  browserAuthSupported: boolean;
};

export type PlaygroundByomPreferences = {
  preferredChatModelSource: PlaygroundChatModelSource;
  fallbackToPlatformModel: boolean;
};

export type ResolvedChatModelAccess = {
  source: PlaygroundChatModelSource;
  requestedModel: string;
  requestedAlias: string;
  resolvedAlias: string;
  resolvedModel: string;
  displayName: string;
  description: string;
  provider: PlaygroundModelProvider;
  baseUrl: string;
  token: string | null;
  capabilities: PlaygroundModelCapabilitySet;
  certification: PlaygroundModelCertification;
  connectionId?: string | null;
  fallbackApplied?: boolean;
};

const OPENAI_PROVIDER = "openai";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_CHAT_CAPABILITIES: PlaygroundModelCapabilitySet = {
  maxContextTokens: 128_000,
  supportsStreaming: true,
  supportsTextActions: true,
  supportsUnifiedDiff: true,
  supportsWriteFile: true,
  supportsMkdir: true,
  supportsShellCommands: true,
  supportsToolLoop: false,
  supportsNativeToolCalls: false,
  preferredAdapter: "text_actions",
  supportedTools: [],
};

function normalizeBaseUrl(value: string | null | undefined): string {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  return normalized || OPENAI_DEFAULT_BASE_URL;
}

function isOpenAiCompatibleAlias(value: string | null | undefined): boolean {
  return String(value || "").trim().toLowerCase().startsWith("user:");
}

function getBrowserAuthSupport(): { enabled: boolean; reason: string } {
  const enabled = String(process.env.OPENAI_BROWSER_AUTH_ENABLED || "").trim() === "true";
  return enabled
    ? { enabled: true, reason: "available" }
    : {
        enabled: false,
        reason: "Official provider account linking is not enabled on this deployment yet.",
      };
}

export function buildProviderAlias(provider: string): string {
  return `user:${String(provider || "").trim().toLowerCase()}`;
}

export function getPlaygroundByomPreferences(profile: {
  preferredModelAlias?: string | null;
  stablePreferences?: unknown;
} | null): PlaygroundByomPreferences {
  const root =
    profile?.stablePreferences && typeof profile.stablePreferences === "object"
      ? (profile.stablePreferences as Record<string, unknown>)
      : {};
  const byom =
    root.byom && typeof root.byom === "object"
      ? (root.byom as Record<string, unknown>)
      : {};
  const preferredChatModelSource =
    byom.preferredChatModelSource === "user_connected" ? "user_connected" : "platform";
  const fallbackToPlatformModel = byom.fallbackToPlatformModel !== false;
  return {
    preferredChatModelSource,
    fallbackToPlatformModel,
  };
}

export function updateStablePreferencesWithByom(input: {
  existing: unknown;
  byom: Partial<PlaygroundByomPreferences>;
}): Record<string, unknown> {
  const root =
    input.existing && typeof input.existing === "object" && !Array.isArray(input.existing)
      ? ({ ...(input.existing as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const current =
    root.byom && typeof root.byom === "object" && !Array.isArray(root.byom)
      ? ({ ...(root.byom as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  root.byom = {
    ...current,
    ...(input.byom.preferredChatModelSource
      ? { preferredChatModelSource: input.byom.preferredChatModelSource }
      : {}),
    ...(input.byom.fallbackToPlatformModel !== undefined
      ? { fallbackToPlatformModel: input.byom.fallbackToPlatformModel }
      : {}),
  };
  return root;
}

export function serializeProviderConnection(
  record: PlaygroundProviderConnectionRecord
): UserConnectedModelSummary {
  return {
    id: record.id,
    provider: record.provider,
    alias: record.alias,
    displayName: record.displayName || `Your ${record.provider} model`,
    authMode: record.authMode,
    baseUrl: record.baseUrl,
    defaultModel: record.defaultModel,
    status: record.status,
    lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
    lastValidationError: record.lastValidationError,
    browserAuthSupported: getBrowserAuthSupport().enabled,
  };
}

export async function listUserConnectedModels(input: {
  userId: string;
}): Promise<UserConnectedModelSummary[]> {
  const rows = await listPlaygroundProviderConnections({ userId: input.userId });
  return rows.map(serializeProviderConnection);
}

export async function validateOpenAiApiKey(input: {
  apiKey: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
}): Promise<{
  ok: true;
  baseUrl: string;
  defaultModel: string;
  availableModels: string[];
}> {
  const apiKey = String(input.apiKey || "").trim();
  if (!apiKey) throw new Error("API key is required.");
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const response = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const raw = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(raw || `Provider validation failed (${response.status}).`);
  }
  let payload: { data?: Array<{ id?: string }> } = {};
  try {
    payload = raw ? (JSON.parse(raw) as { data?: Array<{ id?: string }> }) : {};
  } catch {
    payload = {};
  }
  const availableModels = Array.isArray(payload.data)
    ? payload.data
        .map((item) => String(item?.id || "").trim())
        .filter(Boolean)
        .slice(0, 120)
    : [];
  const defaultModel =
    String(input.defaultModel || "").trim() ||
    (availableModels.includes(OPENAI_DEFAULT_MODEL) ? OPENAI_DEFAULT_MODEL : availableModels[0] || OPENAI_DEFAULT_MODEL);
  return {
    ok: true,
    baseUrl,
    defaultModel,
    availableModels,
  };
}

export async function resolveChatModelAccess(input: {
  userId?: string | null;
  requestedModel?: string | null;
  requestedSource?: PlaygroundChatModelSource | null;
  fallbackToPlatformModel?: boolean;
}): Promise<ResolvedChatModelAccess> {
  const fallbackToPlatformModel = input.fallbackToPlatformModel !== false;
  const requestedModel = String(input.requestedModel || "").trim();
  const platformSelection = resolvePlaygroundModelSelection({
    requested: requestedModel || DEFAULT_PLAYGROUND_MODEL_ALIAS,
  });
  const platformAccess: ResolvedChatModelAccess = {
    source: "platform",
    requestedModel: platformSelection.requested,
    requestedAlias: platformSelection.requestedAlias,
    resolvedAlias: platformSelection.resolvedAlias,
    resolvedModel: platformSelection.resolvedEntry.model,
    displayName: platformSelection.resolvedEntry.displayName,
    description: platformSelection.resolvedEntry.description,
    provider: platformSelection.resolvedEntry.provider,
    baseUrl: platformSelection.resolvedEntry.baseUrl,
    token: resolvePlaygroundModelToken(platformSelection.resolvedEntry),
    capabilities: { ...platformSelection.resolvedEntry.capabilities },
    certification: platformSelection.resolvedEntry.certification,
    connectionId: null,
  };

  if (!input.userId) return platformAccess;

  const profile = await getUserPlaygroundProfile({ userId: input.userId }).catch(() => null);
  const preferences = getPlaygroundByomPreferences(profile);
  const shouldPreferUserConnection =
    input.requestedSource === "user_connected" ||
    (input.requestedSource == null &&
      (isOpenAiCompatibleAlias(requestedModel) ||
        (!requestedModel && preferences.preferredChatModelSource === "user_connected")));

  if (!shouldPreferUserConnection) return platformAccess;

  const requestedAlias =
    requestedModel ||
    profile?.preferredModelAlias ||
    buildProviderAlias(OPENAI_PROVIDER);
  const connection = await getPlaygroundProviderConnectionByAlias({
    userId: input.userId,
    alias: requestedAlias,
  });
  if (!connection) {
    if (fallbackToPlatformModel) return { ...platformAccess, fallbackApplied: true };
    throw new Error("No connected user model matches the requested alias.");
  }

  const secret = decryptSecretPayload<ProviderConnectionSecret>(connection.secretEncrypted);
  if (!secret) {
    if (fallbackToPlatformModel) return { ...platformAccess, fallbackApplied: true };
    throw new Error("Connected model secret is unavailable.");
  }

  if (secret.authMode !== "api_key" || !String(secret.apiKey || "").trim()) {
    if (fallbackToPlatformModel) return { ...platformAccess, fallbackApplied: true };
    throw new Error("Connected model auth is not ready for chat requests.");
  }

  return {
    source: "user_connected",
    requestedModel: requestedAlias,
    requestedAlias,
    resolvedAlias: connection.alias,
    resolvedModel: String(connection.defaultModel || OPENAI_DEFAULT_MODEL).trim() || OPENAI_DEFAULT_MODEL,
    displayName: connection.displayName || "Your OpenAI model",
    description: "User-connected OpenAI-compatible model",
    provider: "openai_compatible",
    baseUrl: normalizeBaseUrl(connection.baseUrl),
    token: secret.apiKey.trim(),
    capabilities: { ...DEFAULT_CHAT_CAPABILITIES },
    certification: "tool_ready",
    connectionId: connection.id,
  };
}

export function buildProviderSecret(input: { authMode: "api_key"; apiKey: string }): string {
  return encryptSecretPayload({
    authMode: input.authMode,
    apiKey: String(input.apiKey || "").trim(),
  } satisfies ProviderConnectionSecret);
}

export function getBrowserAuthAvailability() {
  return getBrowserAuthSupport();
}
