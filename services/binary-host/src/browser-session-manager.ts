import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  BinaryConnectionSecretRecord,
  BinaryProviderId,
} from "./connections.js";

export type BrowserProviderSessionStatus =
  | "pending_browser"
  | "awaiting_import"
  | "importing"
  | "connected"
  | "failed"
  | "cancelled";

export type BrowserProviderSessionView = {
  sessionId: string;
  providerId: BinaryProviderId;
  status: BrowserProviderSessionStatus;
  launchUrl: string;
  importPathHints?: string[];
  note?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type ImportedBrowserProviderAuth = {
  providerId: BinaryProviderId;
  secret: BinaryConnectionSecretRecord;
  importedFrom: string;
  linkedAccountLabel?: string;
};

type StoredBrowserProviderSession = BrowserProviderSessionView & {
  linkedAccountLabel?: string;
  importedAuth?: ImportedBrowserProviderAuth;
  metadata?: Record<string, unknown>;
};

type BrowserProviderAdapter = {
  providerId: BinaryProviderId;
  launchUrl: string;
  importPathHints: string[];
  parseImportedAuth: (raw: string, importedFrom: string) => ImportedBrowserProviderAuth | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeFilePath(input: string): string {
  return path.normalize(path.resolve(input));
}

function candidatePaths(rawCandidates: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const candidate of rawCandidates) {
    const normalized = normalizeFilePath(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function readJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readNestedObject(input: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = input[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    const normalized = typeof value === "string" ? value.trim() : "";
    if (normalized) return normalized;
  }
  return undefined;
}

function readExpiry(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return new Date(value).toISOString();
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value.trim());
      if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
    }
  }
  return undefined;
}

function parseCommonOauthTokens(
  providerId: BinaryProviderId,
  raw: string,
  importedFrom: string
): ImportedBrowserProviderAuth | null {
  const parsed = readJsonObject(raw);
  if (!parsed) return null;
  const tokens = readNestedObject(parsed, "tokens") || parsed;
  const accessToken = readString(tokens, ["access_token", "accessToken", "token", "session_token", "sessionToken"]);
  const refreshToken = readString(tokens, ["refresh_token", "refreshToken"]);
  const idToken = readString(tokens, ["id_token", "idToken"]);
  if (!accessToken && !refreshToken && !idToken) return null;
  const accountHint =
    readString(tokens, ["account_id", "accountId", "email", "username"]) ||
    readString(parsed, ["account_id", "accountId", "email", "username"]);
  return {
    providerId,
    importedFrom,
    secret: {
      ...(accessToken ? { accessToken } : {}),
      ...(refreshToken ? { refreshToken } : {}),
      ...(idToken ? { idToken } : {}),
      ...(readExpiry(tokens, ["expires_at", "expiresAt", "expiry_date"])
        ? { expiresAt: readExpiry(tokens, ["expires_at", "expiresAt", "expiry_date"]) }
        : {}),
      ...(readString(tokens, ["scope"]) ? { scopes: readString(tokens, ["scope"])!.split(/\s+/).filter(Boolean) } : {}),
      ...(accountHint ? { accountHint } : {}),
      importedFrom,
    },
    ...(accountHint ? { linkedAccountLabel: accountHint } : {}),
  };
}

function buildAdapter(providerId: BinaryProviderId): BrowserProviderAdapter | null {
  const home = os.homedir();
  if (providerId === "chatgpt_portal") {
    return {
      providerId,
      launchUrl: "https://chatgpt.com",
      importPathHints: candidatePaths([
        process.env.BINARY_CHATGPT_PORTAL_AUTH_PATH || path.join(home, ".codex", "auth.json"),
      ]),
      parseImportedAuth: (raw, importedFrom) => parseCommonOauthTokens(providerId, raw, importedFrom),
    };
  }
  if (providerId === "qwen_portal") {
    return {
      providerId,
      launchUrl: "https://chat.qwen.ai",
      importPathHints: candidatePaths([
        process.env.BINARY_QWEN_PORTAL_AUTH_PATH || path.join(home, ".qwen", "oauth_creds.json"),
      ]),
      parseImportedAuth: (raw, importedFrom) => parseCommonOauthTokens(providerId, raw, importedFrom),
    };
  }
  if (providerId === "gemini") {
    return {
      providerId,
      launchUrl: "https://ai.google.dev/gemini-api/docs/oauth",
      importPathHints: candidatePaths([
        process.env.BINARY_GEMINI_IMPORT_AUTH_PATH || path.join(home, ".gemini", "oauth_creds.json"),
      ]),
      parseImportedAuth: (raw, importedFrom) => parseCommonOauthTokens(providerId, raw, importedFrom),
    };
  }
  return null;
}

export class BrowserSessionManager {
  private readonly sessions = new Map<string, StoredBrowserProviderSession>();

  start(providerId: BinaryProviderId, metadata?: Record<string, unknown>): BrowserProviderSessionView {
    const adapter = buildAdapter(providerId);
    if (!adapter) {
      throw new Error("This provider does not support browser-session linking.");
    }
    const createdAt = nowIso();
    const session: StoredBrowserProviderSession = {
      sessionId: randomUUID(),
      providerId,
      status: "awaiting_import",
      launchUrl: adapter.launchUrl,
      importPathHints: [...adapter.importPathHints],
      note: "Binary is waiting for local provider credentials to appear so it can import them safely.",
      createdAt,
      updatedAt: createdAt,
      ...(metadata ? { metadata } : {}),
    };
    this.sessions.set(session.sessionId, session);
    return this.toView(session);
  }

  get(sessionId: string): StoredBrowserProviderSession | null {
    return this.sessions.get(String(sessionId || "").trim()) || null;
  }

  getView(sessionId: string): BrowserProviderSessionView | null {
    const session = this.get(sessionId);
    return session ? this.toView(session) : null;
  }

  async tryImport(providerId: BinaryProviderId): Promise<ImportedBrowserProviderAuth | null> {
    const adapter = buildAdapter(providerId);
    if (!adapter) return null;
    for (const targetPath of adapter.importPathHints) {
      if (!existsSync(targetPath)) continue;
      const raw = await fs.readFile(targetPath, "utf8").catch(() => "");
      if (!raw.trim()) continue;
      const imported = adapter.parseImportedAuth(raw, targetPath);
      if (imported) return imported;
    }
    return null;
  }

  async poll(sessionId: string): Promise<StoredBrowserProviderSession | null> {
    const session = this.get(sessionId);
    if (!session) return null;
    if (session.status === "connected" || session.status === "failed" || session.status === "cancelled") {
      return session;
    }
    session.status = "importing";
    session.updatedAt = nowIso();
    try {
      const importedAuth = await this.tryImport(session.providerId);
      if (!importedAuth) {
        session.status = "awaiting_import";
        session.updatedAt = nowIso();
        session.note = "Binary is still waiting for a local provider login to appear.";
        return session;
      }
      session.importedAuth = importedAuth;
      session.linkedAccountLabel = importedAuth.linkedAccountLabel;
      session.status = "connected";
      session.updatedAt = nowIso();
      session.note = "Binary imported the linked browser account successfully.";
      return session;
    } catch (error) {
      session.status = "failed";
      session.updatedAt = nowIso();
      session.error = error instanceof Error ? error.message : "Browser session import failed.";
      return session;
    }
  }

  cancel(sessionId: string): BrowserProviderSessionView | null {
    const session = this.get(sessionId);
    if (!session) return null;
    session.status = "cancelled";
    session.updatedAt = nowIso();
    return this.toView(session);
  }

  getImportedAuth(sessionId: string): ImportedBrowserProviderAuth | null {
    return this.get(sessionId)?.importedAuth || null;
  }

  getMetadata(sessionId: string): Record<string, unknown> | null {
    return this.get(sessionId)?.metadata || null;
  }

  private toView(session: StoredBrowserProviderSession): BrowserProviderSessionView {
    return {
      sessionId: session.sessionId,
      providerId: session.providerId,
      status: session.status,
      launchUrl: session.launchUrl,
      ...(Array.isArray(session.importPathHints) && session.importPathHints.length
        ? { importPathHints: [...session.importPathHints] }
        : {}),
      ...(session.note ? { note: session.note } : {}),
      ...(session.error ? { error: session.error } : {}),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}
