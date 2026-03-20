import * as vscode from "vscode";
import { createHash, randomBytes } from "crypto";
import { URL } from "url";
import { requestJson } from "./http";
import type { HostedAuthState, HostedMeResponse, HostedTokenResponse, RequestAuth } from "./types";

type PendingPkce = {
  state: string;
  verifier: string;
};

export type HostedAuthManagerOptions = {
  context: vscode.ExtensionContext;
  getBaseApiUrl: () => string;
  extensionUriAuthority: string;
  apiKeySecret: string;
  legacyApiKeySecrets?: string[];
  refreshTokenSecret: string;
  pendingPkceKey: string;
  productLabel: string;
  apiKeyTitle: string;
  apiKeyPrompt: string;
  apiKeySavedMessage: string;
  apiKeyClearedMessage: string;
  signInOpenedMessage: string;
  signInCompletedMessage: string;
  signOutMessage: string;
};

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("base64url");
}

export class HostedAuthManager implements vscode.UriHandler {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private signedInEmail: string | null = null;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<HostedAuthState>();

  public readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly options: HostedAuthManagerOptions) {}

  async getAuthState(): Promise<HostedAuthState> {
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
      title: this.options.apiKeyTitle,
      prompt: this.options.apiKeyPrompt,
      password: true,
      ignoreFocusOut: true,
    });
    if (key === undefined) return;

    const trimmed = key.trim();
    if (!trimmed) {
      await this.options.context.secrets.delete(this.options.apiKeySecret);
      for (const legacySecret of this.options.legacyApiKeySecrets || []) {
        await this.options.context.secrets.delete(legacySecret);
      }
      vscode.window.showInformationMessage(this.options.apiKeyClearedMessage);
    } else {
      await this.options.context.secrets.store(this.options.apiKeySecret, trimmed);
      for (const legacySecret of this.options.legacyApiKeySecrets || []) {
        await this.options.context.secrets.delete(legacySecret);
      }
      vscode.window.showInformationMessage(this.options.apiKeySavedMessage);
    }

    await this.emitCurrentState();
  }

  async signInWithBrowser(): Promise<void> {
    const verifier = base64Url(randomBytes(48));
    const state = randomBytes(24).toString("hex");
    const redirectUri = `${vscode.env.uriScheme}://${this.options.extensionUriAuthority}/auth-callback`;
    const authorizeUrl = new URL(`${this.options.getBaseApiUrl()}/api/v1/playground/auth/vscode/authorize`);
    authorizeUrl.searchParams.set("client_id", "vscode");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", sha256Base64Url(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    await this.options.context.globalState.update(this.options.pendingPkceKey, { state, verifier } satisfies PendingPkce);
    await vscode.env.openExternal(vscode.Uri.parse(authorizeUrl.toString()));
    void vscode.window.showInformationMessage(this.options.signInOpenedMessage);
  }

  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    void this.completeBrowserSignIn(uri);
  }

  async signOut(): Promise<void> {
    const refreshToken = await this.options.context.secrets.get(this.options.refreshTokenSecret);
    if (refreshToken) {
      await requestJson(
        "POST",
        `${this.options.getBaseApiUrl()}/api/v1/playground/auth/vscode/revoke`,
        null,
        { refresh_token: refreshToken }
      ).catch(() => null);
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

  private async completeBrowserSignIn(uri: vscode.Uri): Promise<void> {
    if (uri.path !== "/auth-callback") return;

    const pending = this.options.context.globalState.get<PendingPkce>(this.options.pendingPkceKey);
    const params = new URL(uri.toString()).searchParams;
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
      const token = await requestJson<HostedTokenResponse>(
        "POST",
        `${this.options.getBaseApiUrl()}/api/v1/playground/auth/vscode/token`,
        null,
        {
          grant_type: "authorization_code",
          code,
          code_verifier: pending.verifier,
        }
      );
      await this.acceptTokenResponse(token, true);
      await this.options.context.globalState.update(this.options.pendingPkceKey, undefined);
      await this.emitCurrentState();
      vscode.window.showInformationMessage(this.options.signInCompletedMessage);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not complete browser sign-in: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async getStoredApiKey(): Promise<string | null> {
    const keys = [
      await this.options.context.secrets.get(this.options.apiKeySecret),
      ...await Promise.all((this.options.legacyApiKeySecrets || []).map((secret) => this.options.context.secrets.get(secret))),
    ];
    const value = keys.find((item) => String(item || "").trim()) || "";
    return String(value || "").trim() || null;
  }

  private async acceptTokenResponse(token: HostedTokenResponse, allowRefreshStore: boolean): Promise<void> {
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

  private async getBrowserAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const refreshToken = await this.options.context.secrets.get(this.options.refreshTokenSecret);
    if (!refreshToken) return null;

    try {
      const token = await requestJson<HostedTokenResponse>(
        "POST",
        `${this.options.getBaseApiUrl()}/api/v1/playground/auth/vscode/token`,
        null,
        {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }
      );
      await this.acceptTokenResponse(token, false);
      return this.accessToken;
    } catch {
      await this.options.context.secrets.delete(this.options.refreshTokenSecret);
      this.accessToken = null;
      this.accessTokenExpiresAt = 0;
      return null;
    }
  }

  private async resolveSignedInEmail(accessToken: string): Promise<string | null> {
    const response = await requestJson<HostedMeResponse>(
      "GET",
      `${this.options.getBaseApiUrl()}/api/v1/playground/auth/vscode/me`,
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
