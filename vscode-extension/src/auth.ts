import * as vscode from "vscode";
import { createHash, randomBytes } from "crypto";
import { URL } from "url";
import { requestJson } from "./api-client";
import {
  API_KEY_LEGACY_SECRET,
  API_KEY_SECRET,
  PENDING_PKCE_KEY,
  REFRESH_TOKEN_SECRET,
  getBaseApiUrl,
} from "./config";
import type { AuthState, RequestAuth } from "./shared";

type PendingPkce = {
  state: string;
  verifier: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type MeResponse = {
  success?: boolean;
  data?: {
    email?: string;
  };
};

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("base64url");
}

export class AuthManager implements vscode.UriHandler {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private signedInEmail: string | null = null;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<AuthState>();

  public readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async getAuthState(): Promise<AuthState> {
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

  async getRequestAuth(): Promise<RequestAuth | null> {
    const bearer = await this.getBrowserAccessToken().catch(() => null);
    if (bearer) return { bearer };

    const apiKey = await this.getStoredApiKey();
    if (apiKey) return { apiKey };

    return null;
  }

  async getApiKey(): Promise<string | null> {
    return this.getStoredApiKey();
  }

  async setApiKeyInteractive(): Promise<void> {
    const key = await vscode.window.showInputBox({
      title: "Set Binary IDE API Key",
      prompt: "Paste your Binary IDE API key",
      password: true,
      ignoreFocusOut: true,
    });
    if (key === undefined) return;

    const trimmed = key.trim();
    if (!trimmed) {
      await this.context.secrets.delete(API_KEY_SECRET);
      await this.context.secrets.delete(API_KEY_LEGACY_SECRET);
      vscode.window.showInformationMessage("Stored Binary IDE API key cleared.");
    } else {
      await this.context.secrets.store(API_KEY_SECRET, trimmed);
      await this.context.secrets.delete(API_KEY_LEGACY_SECRET);
      vscode.window.showInformationMessage("Binary IDE API key saved.");
    }

    await this.emitCurrentState();
  }

  async signInWithBrowser(): Promise<void> {
    const verifier = base64Url(randomBytes(48));
    const state = randomBytes(24).toString("hex");
    const redirectUri = `${vscode.env.uriScheme}://playgroundai.xpersona-playground/auth-callback`;
    const authorizeUrl = new URL(`${getBaseApiUrl()}/api/v1/playground/auth/vscode/authorize`);
    authorizeUrl.searchParams.set("client_id", "vscode");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", sha256Base64Url(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    await this.context.globalState.update(PENDING_PKCE_KEY, { state, verifier } satisfies PendingPkce);
    await vscode.env.openExternal(vscode.Uri.parse(authorizeUrl.toString()));
    void vscode.window.showInformationMessage("Browser sign-in opened. Finish the flow in your browser.");
  }

  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    void this.completeBrowserSignIn(uri);
  }

  async signOut(): Promise<void> {
    const refreshToken = await this.context.secrets.get(REFRESH_TOKEN_SECRET);
    if (refreshToken) {
      await requestJson(
        "POST",
        `${getBaseApiUrl()}/api/v1/playground/auth/vscode/revoke`,
        null,
        { refresh_token: refreshToken }
      ).catch(() => null);
    }

    await this.context.secrets.delete(REFRESH_TOKEN_SECRET);
    await this.context.secrets.delete(API_KEY_SECRET);
    await this.context.secrets.delete(API_KEY_LEGACY_SECRET);
    await this.context.globalState.update(PENDING_PKCE_KEY, undefined);
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.signedInEmail = null;
    await this.emitCurrentState();
    vscode.window.showInformationMessage("Binary IDE auth cleared.");
  }

  private async completeBrowserSignIn(uri: vscode.Uri): Promise<void> {
    if (uri.path !== "/auth-callback") return;

    const pending = this.context.globalState.get<PendingPkce>(PENDING_PKCE_KEY);
    const params = new URL(uri.toString()).searchParams;
    const error = params.get("error");
    if (error) {
      await this.context.globalState.update(PENDING_PKCE_KEY, undefined);
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
      const token = await requestJson<TokenResponse>(
        "POST",
        `${getBaseApiUrl()}/api/v1/playground/auth/vscode/token`,
        null,
        {
          grant_type: "authorization_code",
          code,
          code_verifier: pending.verifier,
        }
      );
      await this.acceptTokenResponse(token, true);
      await this.context.globalState.update(PENDING_PKCE_KEY, undefined);
      await this.emitCurrentState();
      vscode.window.showInformationMessage("Browser sign-in complete.");
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not complete browser sign-in: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async getStoredApiKey(): Promise<string | null> {
    const key =
      (await this.context.secrets.get(API_KEY_SECRET)) ||
      (await this.context.secrets.get(API_KEY_LEGACY_SECRET)) ||
      "";
    return key.trim() || null;
  }

  private async acceptTokenResponse(token: TokenResponse, allowRefreshStore: boolean): Promise<void> {
    const accessToken = typeof token.access_token === "string" ? token.access_token.trim() : "";
    const refreshToken = typeof token.refresh_token === "string" ? token.refresh_token.trim() : "";
    const expiresIn = Number(token.expires_in || 0);
    if (!accessToken) {
      throw new Error("The token response did not include an access token.");
    }
    this.accessToken = accessToken;
    this.accessTokenExpiresAt = Date.now() + Math.max(60, expiresIn || 900) * 1000;
    if (allowRefreshStore && refreshToken) {
      await this.context.secrets.store(REFRESH_TOKEN_SECRET, refreshToken);
    }
    this.signedInEmail = await this.resolveSignedInEmail(accessToken).catch(() => this.signedInEmail);
  }

  private async getBrowserAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const refreshToken = await this.context.secrets.get(REFRESH_TOKEN_SECRET);
    if (!refreshToken) return null;

    try {
      const token = await requestJson<TokenResponse>(
        "POST",
        `${getBaseApiUrl()}/api/v1/playground/auth/vscode/token`,
        null,
        {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }
      );
      await this.acceptTokenResponse(token, false);
      return this.accessToken;
    } catch {
      await this.context.secrets.delete(REFRESH_TOKEN_SECRET);
      this.accessToken = null;
      this.accessTokenExpiresAt = 0;
      return null;
    }
  }

  private async resolveSignedInEmail(accessToken: string): Promise<string | null> {
    const response = await requestJson<MeResponse>(
      "GET",
      `${getBaseApiUrl()}/api/v1/playground/auth/vscode/me`,
      { bearer: accessToken }
    );
    const email = String(response?.data?.email || "").trim();
    this.signedInEmail = email || null;
    return this.signedInEmail;
  }

  private async emitCurrentState(): Promise<void> {
    this.onDidChangeEmitter.fire(await this.getAuthState());
  }
}
