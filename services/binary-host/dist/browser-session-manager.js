import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
function nowIso() {
    return new Date().toISOString();
}
function normalizeFilePath(input) {
    return path.normalize(path.resolve(input));
}
function candidatePaths(rawCandidates) {
    const seen = new Set();
    const output = [];
    for (const candidate of rawCandidates) {
        const normalized = normalizeFilePath(candidate);
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        output.push(normalized);
    }
    return output;
}
function readJsonObject(raw) {
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function readNestedObject(input, key) {
    const value = input[key];
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function readString(input, keys) {
    for (const key of keys) {
        const value = input[key];
        const normalized = typeof value === "string" ? value.trim() : "";
        if (normalized)
            return normalized;
    }
    return undefined;
}
function readExpiry(input, keys) {
    for (const key of keys) {
        const value = input[key];
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return new Date(value).toISOString();
        }
        if (typeof value === "string" && value.trim()) {
            const parsed = new Date(value.trim());
            if (Number.isFinite(parsed.getTime()))
                return parsed.toISOString();
        }
    }
    return undefined;
}
function parseCommonOauthTokens(providerId, raw, importedFrom) {
    const parsed = readJsonObject(raw);
    if (!parsed)
        return null;
    const tokens = readNestedObject(parsed, "tokens") || parsed;
    const accessToken = readString(tokens, ["access_token", "accessToken", "token", "session_token", "sessionToken"]);
    const refreshToken = readString(tokens, ["refresh_token", "refreshToken"]);
    const idToken = readString(tokens, ["id_token", "idToken"]);
    if (!accessToken && !refreshToken && !idToken)
        return null;
    const accountHint = readString(tokens, ["account_id", "accountId", "email", "username"]) ||
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
            ...(readString(tokens, ["scope"]) ? { scopes: readString(tokens, ["scope"]).split(/\s+/).filter(Boolean) } : {}),
            ...(accountHint ? { accountHint } : {}),
            importedFrom,
        },
        ...(accountHint ? { linkedAccountLabel: accountHint } : {}),
    };
}
function buildAdapter(providerId) {
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
    sessions = new Map();
    start(providerId, metadata) {
        const adapter = buildAdapter(providerId);
        if (!adapter) {
            throw new Error("This provider does not support browser-session linking.");
        }
        const createdAt = nowIso();
        const session = {
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
    get(sessionId) {
        return this.sessions.get(String(sessionId || "").trim()) || null;
    }
    getView(sessionId) {
        const session = this.get(sessionId);
        return session ? this.toView(session) : null;
    }
    async tryImport(providerId) {
        const adapter = buildAdapter(providerId);
        if (!adapter)
            return null;
        for (const targetPath of adapter.importPathHints) {
            if (!existsSync(targetPath))
                continue;
            const raw = await fs.readFile(targetPath, "utf8").catch(() => "");
            if (!raw.trim())
                continue;
            const imported = adapter.parseImportedAuth(raw, targetPath);
            if (imported)
                return imported;
        }
        return null;
    }
    async poll(sessionId) {
        const session = this.get(sessionId);
        if (!session)
            return null;
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
        }
        catch (error) {
            session.status = "failed";
            session.updatedAt = nowIso();
            session.error = error instanceof Error ? error.message : "Browser session import failed.";
            return session;
        }
    }
    cancel(sessionId) {
        const session = this.get(sessionId);
        if (!session)
            return null;
        session.status = "cancelled";
        session.updatedAt = nowIso();
        return this.toView(session);
    }
    getImportedAuth(sessionId) {
        return this.get(sessionId)?.importedAuth || null;
    }
    getMetadata(sessionId) {
        return this.get(sessionId)?.metadata || null;
    }
    toView(session) {
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
