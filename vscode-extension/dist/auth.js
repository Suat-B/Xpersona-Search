"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
const vscode = __importStar(require("vscode"));
const crypto_1 = require("crypto");
const url_1 = require("url");
const api_client_1 = require("./api-client");
const config_1 = require("./config");
function base64Url(bytes) {
    return bytes.toString("base64url");
}
function sha256Base64Url(input) {
    return (0, crypto_1.createHash)("sha256").update(input, "utf8").digest("base64url");
}
class AuthManager {
    constructor(context) {
        this.context = context;
        this.accessToken = null;
        this.accessTokenExpiresAt = 0;
        this.signedInEmail = null;
        this.onDidChangeEmitter = new vscode.EventEmitter();
        this.onDidChange = this.onDidChangeEmitter.event;
    }
    async getAuthState() {
        const bearer = await this.getBrowserAccessToken().catch(() => null);
        if (bearer) {
            const email = await this.resolveSignedInEmail(bearer).catch(() => this.signedInEmail);
            return {
                kind: "browser",
                label: email ? `Signed in as ${email}` : "Signed in with browser",
                ...(email ? { email } : {}),
            };
        }
        const apiKey = await this.getStoredApiKey();
        if (apiKey) {
            return {
                kind: "apiKey",
                label: "Using stored API key",
            };
        }
        return {
            kind: "none",
            label: "Not signed in",
        };
    }
    async getRequestAuth() {
        const bearer = await this.getBrowserAccessToken().catch(() => null);
        if (bearer)
            return { bearer };
        const apiKey = await this.getStoredApiKey();
        if (apiKey)
            return { apiKey };
        return null;
    }
    async getApiKey() {
        return this.getStoredApiKey();
    }
    async setApiKeyInteractive() {
        const key = await vscode.window.showInputBox({
            title: "Set Playground API Key",
            prompt: "Paste your Xpersona API key",
            password: true,
            ignoreFocusOut: true,
        });
        if (key === undefined)
            return;
        const trimmed = key.trim();
        if (!trimmed) {
            await this.context.secrets.delete(config_1.API_KEY_SECRET);
            await this.context.secrets.delete(config_1.API_KEY_LEGACY_SECRET);
            vscode.window.showInformationMessage("Stored Playground API key cleared.");
        }
        else {
            await this.context.secrets.store(config_1.API_KEY_SECRET, trimmed);
            await this.context.secrets.delete(config_1.API_KEY_LEGACY_SECRET);
            vscode.window.showInformationMessage("Playground API key saved.");
        }
        await this.emitCurrentState();
    }
    async signInWithBrowser() {
        const verifier = base64Url((0, crypto_1.randomBytes)(48));
        const state = (0, crypto_1.randomBytes)(24).toString("hex");
        const redirectUri = `${vscode.env.uriScheme}://playgroundai.xpersona-playground/auth-callback`;
        const authorizeUrl = new url_1.URL(`${(0, config_1.getBaseApiUrl)()}/api/v1/playground/auth/vscode/authorize`);
        authorizeUrl.searchParams.set("client_id", "vscode");
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("code_challenge", sha256Base64Url(verifier));
        authorizeUrl.searchParams.set("code_challenge_method", "S256");
        await this.context.globalState.update(config_1.PENDING_PKCE_KEY, { state, verifier });
        await vscode.env.openExternal(vscode.Uri.parse(authorizeUrl.toString()));
        void vscode.window.showInformationMessage("Browser sign-in opened. Finish the flow in your browser.");
    }
    handleUri(uri) {
        void this.completeBrowserSignIn(uri);
    }
    async signOut() {
        const refreshToken = await this.context.secrets.get(config_1.REFRESH_TOKEN_SECRET);
        if (refreshToken) {
            await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/auth/vscode/revoke`, null, { refresh_token: refreshToken }).catch(() => null);
        }
        await this.context.secrets.delete(config_1.REFRESH_TOKEN_SECRET);
        await this.context.secrets.delete(config_1.API_KEY_SECRET);
        await this.context.secrets.delete(config_1.API_KEY_LEGACY_SECRET);
        await this.context.globalState.update(config_1.PENDING_PKCE_KEY, undefined);
        this.accessToken = null;
        this.accessTokenExpiresAt = 0;
        this.signedInEmail = null;
        await this.emitCurrentState();
        vscode.window.showInformationMessage("Playground auth cleared.");
    }
    async completeBrowserSignIn(uri) {
        if (uri.path !== "/auth-callback")
            return;
        const pending = this.context.globalState.get(config_1.PENDING_PKCE_KEY);
        const params = new url_1.URL(uri.toString()).searchParams;
        const error = params.get("error");
        if (error) {
            await this.context.globalState.update(config_1.PENDING_PKCE_KEY, undefined);
            vscode.window.showErrorMessage(`Browser sign-in failed: ${error}`);
            return;
        }
        const code = params.get("code") || "";
        const state = params.get("state") || "";
        if (!pending || !code || !state || state !== pending.state) {
            vscode.window.showErrorMessage("Browser sign-in callback did not match the pending request.");
            return;
        }
        try {
            const token = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/auth/vscode/token`, null, {
                grant_type: "authorization_code",
                code,
                code_verifier: pending.verifier,
            });
            await this.acceptTokenResponse(token, true);
            await this.context.globalState.update(config_1.PENDING_PKCE_KEY, undefined);
            await this.emitCurrentState();
            vscode.window.showInformationMessage("Browser sign-in complete.");
        }
        catch (error) {
            vscode.window.showErrorMessage(`Could not complete browser sign-in: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getStoredApiKey() {
        const key = (await this.context.secrets.get(config_1.API_KEY_SECRET)) ||
            (await this.context.secrets.get(config_1.API_KEY_LEGACY_SECRET)) ||
            "";
        return key.trim() || null;
    }
    async acceptTokenResponse(token, allowRefreshStore) {
        const accessToken = typeof token.access_token === "string" ? token.access_token.trim() : "";
        const refreshToken = typeof token.refresh_token === "string" ? token.refresh_token.trim() : "";
        const expiresIn = Number(token.expires_in || 0);
        if (!accessToken) {
            throw new Error("The token response did not include an access token.");
        }
        this.accessToken = accessToken;
        this.accessTokenExpiresAt = Date.now() + Math.max(60, expiresIn || 900) * 1000;
        if (allowRefreshStore && refreshToken) {
            await this.context.secrets.store(config_1.REFRESH_TOKEN_SECRET, refreshToken);
        }
        this.signedInEmail = await this.resolveSignedInEmail(accessToken).catch(() => this.signedInEmail);
    }
    async getBrowserAccessToken() {
        if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60000) {
            return this.accessToken;
        }
        const refreshToken = await this.context.secrets.get(config_1.REFRESH_TOKEN_SECRET);
        if (!refreshToken)
            return null;
        try {
            const token = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/auth/vscode/token`, null, {
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            });
            await this.acceptTokenResponse(token, false);
            return this.accessToken;
        }
        catch {
            await this.context.secrets.delete(config_1.REFRESH_TOKEN_SECRET);
            this.accessToken = null;
            this.accessTokenExpiresAt = 0;
            return null;
        }
    }
    async resolveSignedInEmail(accessToken) {
        const response = await (0, api_client_1.requestJson)("GET", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/auth/vscode/me`, { bearer: accessToken });
        const email = String(response?.data?.email || "").trim();
        this.signedInEmail = email || null;
        return this.signedInEmail;
    }
    async emitCurrentState() {
        this.onDidChangeEmitter.fire(await this.getAuthState());
    }
}
exports.AuthManager = AuthManager;
//# sourceMappingURL=auth.js.map