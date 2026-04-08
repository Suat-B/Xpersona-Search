export type BinaryConnectionTransport = "http" | "sse";
export type BinaryConnectionAuthMode = "none" | "bearer" | "api-key" | "oauth";
export type BinaryConnectionSource = "starter" | "guided" | "imported";
export type BinaryConnectionStatus = "connected" | "disabled" | "needs_auth" | "failed_test";
export type BinaryConnectionAuthHealth = "ready" | "needs_reauth" | "refresh_failed" | "expired" | "blocked";
export type BinaryProviderId =
  | "openai"
  | "chatgpt_portal"
  | "qwen_dashscope"
  | "qwen_portal"
  | "openrouter"
  | "anthropic"
  | "gemini"
  | "groq"
  | "github_models"
  | "azure_openai"
  | "vertex_ai";
export type BinaryProviderAuthStrategy = "api_key" | "oauth_pkce" | "oauth_device" | "browser_session";
export type BinaryProviderConnectionMode =
  | "direct_oauth_pkce"
  | "direct_oauth_device"
  | "hub_oauth"
  | "portal_session"
  | "local_credential_adapter"
  | "api_key_only"
  | "unsupported";
export type BinaryProviderOauthCapability =
  | "none"
  | "pkce_public_client"
  | "device_code"
  | "brokered_confidential_client";
export type BinaryProviderModelCoverageMode = "provider_direct" | "hub_catalog";

export type BinaryConnectionRecord = {
  id: string;
  name: string;
  transport: BinaryConnectionTransport;
  url: string;
  authMode: BinaryConnectionAuthMode;
  enabled: boolean;
  source: BinaryConnectionSource;
  createdAt: string;
  updatedAt: string;
  headerName?: string;
  publicHeaders?: Record<string, string>;
  importedFrom?: string;
  oauthSupported?: boolean;
  lastValidatedAt?: string;
  lastValidationOk?: boolean;
  lastValidationError?: string;
  providerId?: BinaryProviderId;
  providerAuthStrategy?: BinaryProviderAuthStrategy;
  defaultBaseUrl?: string;
  defaultModel?: string;
  preferredForModels?: boolean;
  linkedAccountLabel?: string;
  linkedAt?: string;
  lastRefreshedAt?: string;
  authHealth?: BinaryConnectionAuthHealth;
  refreshFailureCount?: number;
  lastAuthError?: string;
  runtimeReady?: boolean;
  runtimeReadinessReason?: string;
  routeKind?: string;
  routeLabel?: string;
  routeReason?: string;
  modelFamilies?: string[];
  availableModels?: string[];
};

export type BinaryConnectionSecretRecord = {
  bearerToken?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
  idToken?: string;
  accountHint?: string;
  tenantHint?: string;
  tokenType?: string;
  sessionToken?: string;
  cookieJarRef?: string;
  importedFrom?: string;
  secretHeaders?: Record<string, string>;
};

export type BinaryConnectionView = BinaryConnectionRecord & {
  status: BinaryConnectionStatus;
  hasSecret: boolean;
};

export type ConnectionDraftInput = {
  id?: string;
  name?: string;
  transport?: unknown;
  url?: unknown;
  authMode?: unknown;
  enabled?: unknown;
  source?: unknown;
  headerName?: unknown;
  publicHeaders?: unknown;
  oauthSupported?: unknown;
  importedFrom?: unknown;
};

export type ImportedConnectionDefinition = {
  record: Omit<
    BinaryConnectionRecord,
    "id" | "createdAt" | "updatedAt" | "lastValidatedAt" | "lastValidationOk" | "lastValidationError"
  >;
  secret: BinaryConnectionSecretRecord;
};

const DEFAULT_API_KEY_HEADER = "X-API-Key";
const URL_SCHEMES = new Set(["http:", "https:"]);

function compactWhitespace(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHeaders(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => [compactWhitespace(key), String(raw ?? "").trim()] as const)
    .filter(([key, raw]) => key && raw);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function validateConnectionDraft(input: ConnectionDraftInput): {
  ok: true;
  draft: {
    id?: string;
    name: string;
    transport: BinaryConnectionTransport;
    url: string;
    authMode: BinaryConnectionAuthMode;
    enabled: boolean;
    source: BinaryConnectionSource;
    headerName?: string;
    publicHeaders?: Record<string, string>;
    oauthSupported?: boolean;
    importedFrom?: string;
  };
} | {
  ok: false;
  message: string;
} {
  const name = compactWhitespace(input.name);
  if (!name) {
    return { ok: false, message: "Connection name is required." };
  }

  const transport =
    input.transport === "http" || input.transport === "sse" ? input.transport : null;
  if (!transport) {
    return { ok: false, message: "Connection transport must be http or sse." };
  }

  const urlText = String(input.url ?? "").trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlText);
  } catch {
    return { ok: false, message: "Connection URL must be a valid http or https URL." };
  }
  if (!URL_SCHEMES.has(parsedUrl.protocol)) {
    return { ok: false, message: "Only http and https connection URLs are supported in v1." };
  }

  const authMode =
    input.authMode === "none" ||
    input.authMode === "bearer" ||
    input.authMode === "api-key" ||
    input.authMode === "oauth"
      ? input.authMode
      : "none";

  const headerName =
    authMode === "api-key"
      ? compactWhitespace(input.headerName) || DEFAULT_API_KEY_HEADER
      : undefined;

  const publicHeaders = normalizeHeaders(input.publicHeaders);

  return {
    ok: true,
    draft: {
      ...(typeof input.id === "string" && input.id.trim() ? { id: input.id.trim() } : {}),
      name,
      transport,
      url: parsedUrl.toString(),
      authMode,
      enabled: input.enabled === false ? false : true,
      source:
        input.source === "starter" || input.source === "guided" || input.source === "imported"
          ? input.source
          : "guided",
      ...(headerName ? { headerName } : {}),
      ...(publicHeaders ? { publicHeaders } : {}),
      ...(input.oauthSupported === true ? { oauthSupported: true } : {}),
      ...(typeof input.importedFrom === "string" && input.importedFrom.trim()
        ? { importedFrom: input.importedFrom.trim() }
        : {}),
    },
  };
}

export function connectionHasRequiredSecret(
  record: Pick<BinaryConnectionRecord, "authMode">,
  secret: BinaryConnectionSecretRecord | null | undefined
): boolean {
  if (record.authMode === "none") return true;
  if (record.authMode === "oauth") {
    return Boolean(secret?.accessToken?.trim() || secret?.refreshToken?.trim() || secret?.sessionToken?.trim());
  }
  if (record.authMode === "bearer") return Boolean(secret?.bearerToken?.trim());
  if (record.authMode === "api-key") return Boolean(secret?.apiKey?.trim());
  return false;
}

export function getConnectionStatus(
  record: Pick<
    BinaryConnectionRecord,
    "enabled" | "authMode" | "lastValidationOk" | "lastValidationError"
  >,
  secret: BinaryConnectionSecretRecord | null | undefined
): BinaryConnectionStatus {
  if (!record.enabled) return "disabled";
  if (!connectionHasRequiredSecret(record, secret)) return "needs_auth";
  if (record.lastValidationOk === false || Boolean(record.lastValidationError)) return "failed_test";
  return "connected";
}

export function buildConnectionView(
  record: BinaryConnectionRecord,
  secret: BinaryConnectionSecretRecord | null | undefined
): BinaryConnectionView {
  return {
    ...record,
    status: getConnectionStatus(record, secret),
    hasSecret: connectionHasRequiredSecret(record, secret),
  };
}

export function materializeConnectionForOpenHands(
  record: BinaryConnectionRecord,
  secret: BinaryConnectionSecretRecord | null | undefined
): Record<string, unknown> | null {
  if (!record.enabled) return null;
  if (!connectionHasRequiredSecret(record, secret)) return null;

  const headers = {
    ...(record.publicHeaders || {}),
    ...(secret?.secretHeaders || {}),
  } as Record<string, string>;

  if (record.authMode === "bearer" && secret?.bearerToken?.trim()) {
    headers.Authorization = `Bearer ${secret.bearerToken.trim()}`;
  }
  if (record.authMode === "api-key" && secret?.apiKey?.trim()) {
    headers[record.headerName || DEFAULT_API_KEY_HEADER] = secret.apiKey.trim();
  }

  const base = {
    url: record.url,
    transport: record.transport,
  } as Record<string, unknown>;

  if (record.authMode === "oauth") {
    return {
      ...base,
      auth: "oauth",
    };
  }

  if (Object.keys(headers).length) {
    return {
      ...base,
      headers,
      ...(record.authMode === "api-key" && secret?.apiKey?.trim() ? { api_key: secret.apiKey.trim() } : {}),
    };
  }

  return base;
}

export function buildOpenHandsMcpConfig(
  records: BinaryConnectionRecord[],
  secrets: Record<string, BinaryConnectionSecretRecord | null | undefined>
): { mcpServers: Record<string, Record<string, unknown>> } | undefined {
  const entries = records
    .map((record) => [record.name, materializeConnectionForOpenHands(record, secrets[record.id])] as const)
    .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[1]));
  if (!entries.length) return undefined;
  return {
    mcpServers: Object.fromEntries(entries),
  };
}

export function importConnectionsFromMcpJson(
  raw: string,
  importedFrom?: string
): { ok: true; definitions: ImportedConnectionDefinition[] } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw || ""));
  } catch {
    return { ok: false, message: "The provided .mcp.json is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "The provided .mcp.json must contain an object root." };
  }
  const servers = (parsed as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    return { ok: false, message: "The provided .mcp.json must contain an mcpServers object." };
  }

  const definitions: ImportedConnectionDefinition[] = [];
  for (const [name, rawServer] of Object.entries(servers as Record<string, unknown>)) {
    if (typeof rawServer === "string") {
      const draft = validateConnectionDraft({
        name,
        transport: "http",
        url: rawServer,
        authMode: "none",
        enabled: true,
        source: "imported",
        importedFrom,
      });
      if (!draft.ok) return draft;
      definitions.push({
        record: draft.draft,
        secret: {},
      });
      continue;
    }

    if (!rawServer || typeof rawServer !== "object" || Array.isArray(rawServer)) {
      return { ok: false, message: `Connection "${name}" must be a URL or object.` };
    }

    const server = rawServer as Record<string, unknown>;
    if (typeof server.command === "string" || Array.isArray(server.args)) {
      return {
        ok: false,
        message: `Connection "${name}" uses stdio. Local stdio MCP servers are not supported in v1.`,
      };
    }

    const rawHeaders = normalizeHeaders(server.headers);
    const authMode = server.auth === "oauth"
      ? "oauth"
      : rawHeaders?.Authorization
        ? "bearer"
        : rawHeaders?.["X-API-Key"] || rawHeaders?.["x-api-key"]
          ? "api-key"
          : "none";

    const secret: BinaryConnectionSecretRecord = {};
    const publicHeaders = { ...(rawHeaders || {}) };

    if (typeof publicHeaders.Authorization === "string") {
      const authHeader = publicHeaders.Authorization.trim();
      if (/^Bearer\s+/i.test(authHeader)) {
        secret.bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
        delete publicHeaders.Authorization;
      }
    }
    const apiKeyHeader = Object.keys(publicHeaders).find((key) => key.toLowerCase() === "x-api-key");
    if (apiKeyHeader && typeof publicHeaders[apiKeyHeader] === "string") {
      secret.apiKey = publicHeaders[apiKeyHeader].trim();
      delete publicHeaders[apiKeyHeader];
    }

    const draft = validateConnectionDraft({
      name,
      transport:
        server.transport === "sse"
          ? "sse"
          : server.transport === "http" || server.transport === "streamable_http"
            ? "http"
            : "http",
      url: server.url,
      authMode,
      enabled: server.enabled === false ? false : true,
      source: "imported",
      publicHeaders,
      headerName: apiKeyHeader || DEFAULT_API_KEY_HEADER,
      oauthSupported: server.auth === "oauth",
      importedFrom,
    });
    if (!draft.ok) return draft;
    definitions.push({
      record: draft.draft,
      secret,
    });
  }

  return { ok: true, definitions };
}
