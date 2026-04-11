import { createHash, randomBytes, randomUUID } from "node:crypto";
function nowIso() {
    return new Date().toISOString();
}
function toBase64Url(buffer) {
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}
function buildCodeVerifier() {
    return toBase64Url(randomBytes(48));
}
function buildCodeChallenge(verifier) {
    return toBase64Url(createHash("sha256").update(verifier).digest());
}
function buildExpiresAt(expiresIn) {
    if (!Number.isFinite(expiresIn) || !expiresIn || expiresIn <= 0)
        return undefined;
    return new Date(Date.now() + expiresIn * 1000).toISOString();
}
function buildSearch(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        const normalized = String(value || "").trim();
        if (!normalized)
            continue;
        search.set(key, normalized);
    }
    return search;
}
function parseTokenResponse(payload) {
    const accessToken = String(payload.access_token || "").trim();
    if (!accessToken) {
        throw new Error(payload.error_description || payload.error || "OAuth token exchange did not return an access token.");
    }
    return {
        accessToken,
        ...(payload.refresh_token ? { refreshToken: String(payload.refresh_token).trim() } : {}),
        ...(payload.expires_in ? { expiresAt: buildExpiresAt(payload.expires_in) } : {}),
        ...(payload.scope
            ? {
                scopes: payload.scope
                    .split(/\s+/)
                    .map((entry) => entry.trim())
                    .filter(Boolean),
            }
            : {}),
        ...(payload.id_token ? { idToken: String(payload.id_token).trim() } : {}),
        ...(payload.token_type ? { tokenType: String(payload.token_type).trim() } : {}),
    };
}
export class OAuthSessionManager {
    sessions = new Map();
    sessionsByState = new Map();
    startPkceSession(input) {
        const createdAt = nowIso();
        const sessionId = randomUUID();
        const state = randomUUID();
        const codeVerifier = buildCodeVerifier();
        const codeChallenge = buildCodeChallenge(codeVerifier);
        const authorizeUrl = new URL(input.config.authorizationEndpoint);
        authorizeUrl.search = buildSearch({
            response_type: "code",
            client_id: input.config.clientId,
            redirect_uri: input.config.redirectUri,
            scope: input.config.scopes.join(" "),
            state,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            ...input.config.extraAuthorizationParams,
        }).toString();
        const session = {
            sessionId,
            providerId: input.providerId,
            status: "awaiting_callback",
            authorizeUrl: authorizeUrl.toString(),
            createdAt,
            updatedAt: createdAt,
            state,
            codeVerifier,
            metadata: input.metadata,
            config: input.config,
        };
        this.sessions.set(sessionId, session);
        this.sessionsByState.set(state, sessionId);
        return this.toPollView(session);
    }
    async startDeviceSession(input) {
        if (!input.config.deviceAuthorizationEndpoint) {
            throw new Error("This provider does not expose a device-code authorization endpoint.");
        }
        const createdAt = nowIso();
        const sessionId = randomUUID();
        const response = await fetch(input.config.deviceAuthorizationEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: buildSearch({
                client_id: input.config.clientId,
                scope: input.config.scopes.join(" "),
            }).toString(),
        });
        const payload = (await response.json().catch(() => ({})));
        if (!response.ok || !payload.device_code) {
            throw new Error(payload.error_description || payload.message || payload.error || "Device authorization failed.");
        }
        const session = {
            sessionId,
            providerId: input.providerId,
            status: "pending_browser",
            verificationUri: String(payload.verification_uri || payload.verification_url || "").trim() || undefined,
            userCode: String(payload.user_code || "").trim() || undefined,
            createdAt,
            updatedAt: createdAt,
            expiresAt: buildExpiresAt(payload.expires_in),
            state: String(payload.device_code).trim(),
            metadata: {
                ...(input.metadata || {}),
                deviceCode: String(payload.device_code).trim(),
                interval: Number(payload.interval || 5),
            },
            config: input.config,
        };
        this.sessions.set(sessionId, session);
        this.sessionsByState.set(session.state, sessionId);
        return this.toPollView(session);
    }
    getSession(sessionId) {
        const normalized = String(sessionId || "").trim();
        if (!normalized)
            return null;
        return this.sessions.get(normalized) || null;
    }
    getPollView(sessionId) {
        const session = this.getSession(sessionId);
        return session ? this.toPollView(session) : null;
    }
    async completeCallback(callbackUrl) {
        const state = String(callbackUrl.searchParams.get("state") || "").trim();
        const code = String(callbackUrl.searchParams.get("code") || "").trim();
        const error = String(callbackUrl.searchParams.get("error") || "").trim();
        const errorDescription = String(callbackUrl.searchParams.get("error_description") || "").trim();
        const sessionId = this.sessionsByState.get(state);
        if (!sessionId) {
            throw new Error("Binary could not match this OAuth callback to a pending login session.");
        }
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error("Binary lost the pending OAuth session before the browser callback completed.");
        }
        if (error) {
            session.status = "failed";
            session.updatedAt = nowIso();
            session.error = errorDescription || error;
            return session;
        }
        if (!code || !session.codeVerifier) {
            session.status = "failed";
            session.updatedAt = nowIso();
            session.error = "The OAuth callback did not include an authorization code.";
            return session;
        }
        const response = await fetch(session.config.tokenEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: buildSearch({
                grant_type: "authorization_code",
                code,
                client_id: session.config.clientId,
                ...(session.config.clientSecret ? { client_secret: session.config.clientSecret } : {}),
                redirect_uri: session.config.redirectUri,
                code_verifier: session.codeVerifier,
                ...session.config.extraTokenParams,
            }).toString(),
        });
        const payload = (await response.json().catch(() => ({})));
        if (!response.ok) {
            session.status = "failed";
            session.updatedAt = nowIso();
            session.error = payload.error_description || payload.error || "OAuth token exchange failed.";
            return session;
        }
        session.status = "connected";
        session.updatedAt = nowIso();
        session.tokenSet = parseTokenResponse(payload);
        session.expiresAt = session.tokenSet.expiresAt;
        return session;
    }
    async refreshSessionToken(input) {
        const config = "config" in input.sessionOrConfig ? input.sessionOrConfig.config : input.sessionOrConfig;
        const response = await fetch(config.tokenEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: buildSearch({
                grant_type: "refresh_token",
                refresh_token: input.refreshToken,
                client_id: config.clientId,
                ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
                ...config.extraTokenParams,
            }).toString(),
        });
        const payload = (await response.json().catch(() => ({})));
        if (!response.ok) {
            throw new Error(payload.error_description || payload.error || "OAuth token refresh failed.");
        }
        return parseTokenResponse(payload);
    }
    async revokeSessionToken(input) {
        const config = "config" in input.sessionOrConfig ? input.sessionOrConfig.config : input.sessionOrConfig;
        if (!config.revocationEndpoint)
            return;
        await fetch(config.revocationEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: buildSearch({
                token: input.token,
                client_id: config.clientId,
                ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
            }).toString(),
        }).catch(() => undefined);
    }
    markSessionCancelled(sessionId) {
        const session = this.getSession(sessionId);
        if (!session)
            return;
        session.status = "cancelled";
        session.updatedAt = nowIso();
    }
    deleteSession(sessionId) {
        const session = this.getSession(sessionId);
        if (!session)
            return;
        this.sessions.delete(session.sessionId);
        this.sessionsByState.delete(session.state);
    }
    toPollView(session) {
        return {
            sessionId: session.sessionId,
            providerId: session.providerId,
            status: session.status,
            ...(session.authorizeUrl ? { authorizeUrl: session.authorizeUrl } : {}),
            ...(session.verificationUri ? { verificationUri: session.verificationUri } : {}),
            ...(session.userCode ? { userCode: session.userCode } : {}),
            ...(session.error ? { error: session.error } : {}),
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            ...(session.expiresAt ? { expiresAt: session.expiresAt } : {}),
        };
    }
}
