import { describe, expect, it, vi, afterEach } from "vitest";
import { OAuthSessionManager } from "./oauth-session-manager.js";
describe("OAuthSessionManager", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });
    it("creates a PKCE browser session with an authorize URL", () => {
        const manager = new OAuthSessionManager();
        const session = manager.startPkceSession({
            providerId: "gemini",
            config: {
                providerId: "gemini",
                clientId: "client-id",
                authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
                tokenEndpoint: "https://oauth2.googleapis.com/token",
                redirectUri: "http://127.0.0.1:7777/v1/providers/connect/oauth/callback",
                scopes: ["openid", "email"],
            },
        });
        expect(session.status).toBe("awaiting_callback");
        expect(session.authorizeUrl).toContain("code_challenge=");
        expect(session.authorizeUrl).toContain("client_id=client-id");
    });
    it("exchanges the callback code for tokens", async () => {
        const manager = new OAuthSessionManager();
        const started = manager.startPkceSession({
            providerId: "gemini",
            config: {
                providerId: "gemini",
                clientId: "client-id",
                authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
                tokenEndpoint: "https://oauth2.googleapis.com/token",
                redirectUri: "http://127.0.0.1:7777/v1/providers/connect/oauth/callback",
                scopes: ["openid", "email"],
            },
        });
        const state = new URL(started.authorizeUrl || "").searchParams.get("state");
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_in: 3600,
            scope: "openid email",
            token_type: "Bearer",
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        })));
        const session = await manager.completeCallback(new URL(`http://127.0.0.1:7777/v1/providers/connect/oauth/callback?code=abc123&state=${state}`));
        expect(session.status).toBe("connected");
        expect(session.tokenSet?.accessToken).toBe("access-token");
        expect(session.tokenSet?.refreshToken).toBe("refresh-token");
    });
});
