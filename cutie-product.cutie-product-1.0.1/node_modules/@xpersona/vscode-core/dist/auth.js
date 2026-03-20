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
exports.HostedAuthManager = void 0;
const vscode = __importStar(require("vscode"));
const crypto_1 = require("crypto");
const url_1 = require("url");
const http_1 = require("./http");
function base64Url(bytes) {
    return bytes.toString("base64url");
}
function sha256Base64Url(input) {
    return (0, crypto_1.createHash)("sha256").update(input, "utf8").digest("base64url");
}
class HostedAuthManager {
    constructor(options) {
        this.options = options;
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
                label: email ? `Signed in as ${email}` : `Signed in with ${this.options.productLabel}`,
                ...(email ? { email } : {}),
            };
        }
        const apiKey = await this.getStoredApiKey();
        if (apiKey) {
            return {
                kind: "apiKey",
                label: `Using ${this.options.productLabel} API key`,
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
            title: this.options.apiKeyTitle,
            prompt: this.options.apiKeyPrompt,
            password: true,
            ignoreFocusOut: true,
        });
        if (key === undefined)
            return;
        const trimmed = key.trim();
        if (!trimmed) {
            await this.options.context.secrets.delete(this.options.apiKeySecret);
            for (const legacySecret of this.options.legacyApiKeySecrets || []) {
                await this.options.context.secrets.delete(legacySecret);
            }
            vscode.window.showInformationMessage(this.options.apiKeyClearedMessage);
        }
        else {
            await this.options.context.secrets.store(this.options.apiKeySecret, trimmed);
            for (const legacySecret of this.options.legacyApiKeySecrets || []) {
                await this.options.context.secrets.delete(legacySecret);
            }
            vscode.window.showInformationMessage(this.options.apiKeySavedMessage);
        }
        await this.emitCurrentState();
    }
    async signInWithBrowser() {
        const verifier = base64Url((0, crypto_1.randomBytes)(48));
        const state = (0, crypto_1.randomBytes)(24).toString("hex");
        const redirectUri = `${vscode.env.uriScheme}://${this.options.extensionUriAuthority}/auth-callback`;
        const authorizeUrl = new url_1.URL(`${this.options.getBaseApiUrl()}/api/v1/playground/auth/vscode/authorize`);
        authorizeUrl.searchParams.set("client_id", "vscode");
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("code_challenge", sha256Base64Url(verifier));
        authorizeUrl.searchParams.set("code_challenge_method", "S256");
        await this.options.context.globalState.update(this.options.pendingPkceKey, { state, verifier });
        await vscode.env.openExternal(vscode.Uri.parse(authorizeUrl.toString()));
        void vscode.window.showInformationMessage(this.options.signInOpenedMessage);
    }
    handleUri(uri) {
        void this.completeBrowserSignIn(uri);
    }
    async signOut() {
        const refreshToken = await this.options.context.secrets.get(this.options.refreshTokenSecret);
        if (refreshToken) {
            await (0, http_1.requestJson)("POST", `${this.options.getBaseApiUrl()}/api/v1/playground/auth/vscode/revoke`, null, { refresh_token: refreshToken }).catch(() => null);
        }
        await this.options.context.secrets.delete(this.options.refreshTokenSecret);
        await this.options.context.secrets.delete(this.options.apiKeySecret);
        for (const legacySecret of this.options.legacyApiKeySecrets || []) {
            await this.options.context.secrets.delete(legacySecret);
        }
        await this.options.context.globalState.update(this.options.pendingPkceKey, undefined);
        this.accessToken = null;
        this.accessTokenExpiresAt = 0;
        this.signedInEmail = null;
        await this.emitCurrentState();
        vscode.window.showInformationMessage(this.options.signOutMessage);
    }
    async completeBrowserSignIn(uri) {
        if (uri.path !== "/auth-callback")
            return;
        const pending = this.options.context.globalState.get(this.options.pendingPkceKey);
        const params = new url_1.URL(uri.toString()).searchParams;
        const error = params.get("error");
        if (error) {
            await this.options.context.globalState.update(this.options.pendingPkceKey, undefined);
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
            const token = await (0, http_1.requestJson)("POST", `${this.options.getBaseApiUrl()}/api/v1/playground/auth/vscode/token`, null, {
                grant_type: "authorization_code",
                code,
                code_verifier: pending.verifier,
            });
            await this.acceptTokenResponse(token, true);
            await this.options.context.globalState.update(this.options.pendingPkceKey, undefined);
            await this.emitCurrentState();
            vscode.window.showInformationMessage(this.options.signInCompletedMessage);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Could not complete browser sign-in: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getStoredApiKey() {
        const keys = [
            await this.options.context.secrets.get(this.options.apiKeySecret),
            ...await Promise.all((this.options.legacyApiKeySecrets || []).map((secret) => this.options.context.secrets.get(secret))),
        ];
        const value = keys.find((item) => String(item || "").trim()) || "";
        return String(value || "").trim() || null;
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
            await this.options.context.secrets.store(this.options.refreshTokenSecret, refreshToken);
        }
        this.signedInEmail = await this.resolveSignedInEmail(accessToken).catch(() => this.signedInEmail);
    }
    async getBrowserAccessToken() {
        if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60000) {
            return this.accessToken;
        }
        const refreshToken = await this.options.context.secrets.get(this.options.refreshTokenSecret);
        if (!refreshToken)
            return null;
        try {
            const token = await (0, http_1.requestJson)("POST", `${this.options.getBaseApiUrl()}/api/v1/playground/auth/vscode/token`, null, {
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            });
            await this.acceptTokenResponse(token, false);
            return this.accessToken;
        }
        catch {
            await this.options.context.secrets.delete(this.options.refreshTokenSecret);
            this.accessToken = null;
            this.accessTokenExpiresAt = 0;
            return null;
        }
    }
    async resolveSignedInEmail(accessToken) {
        const response = await (0, http_1.requestJson)("GET", `${this.options.getBaseApiUrl()}/api/v1/playground/auth/vscode/me`, { bearer: accessToken });
        const email = String(response?.data?.email || "").trim();
        this.signedInEmail = email || null;
        return this.signedInEmail;
    }
    async emitCurrentState() {
        this.onDidChangeEmitter.fire(await this.getAuthState());
    }
}
exports.HostedAuthManager = HostedAuthManager;
