import * as vscode from "vscode";
import { HostedAuthManager } from "@xpersona/vscode-core";
import {
  API_KEY_LEGACY_SECRET,
  API_KEY_SECRET,
  PENDING_PKCE_KEY,
  REFRESH_TOKEN_SECRET,
  getBaseApiUrl,
} from "./config";
export class AuthManager extends HostedAuthManager {
  constructor(context: vscode.ExtensionContext) {
    super({
      context,
      getBaseApiUrl,
      extensionUriAuthority: "playgroundai.xpersona-playground",
      apiKeySecret: API_KEY_SECRET,
      legacyApiKeySecrets: [API_KEY_LEGACY_SECRET],
      refreshTokenSecret: REFRESH_TOKEN_SECRET,
      pendingPkceKey: PENDING_PKCE_KEY,
      productLabel: "Xpersona Binary IDE",
      apiKeyTitle: "Set Xpersona Binary IDE API Key",
      apiKeyPrompt: "Paste your Xpersona Binary IDE API key",
      apiKeySavedMessage: "Xpersona Binary IDE API key saved.",
      apiKeyClearedMessage: "Xpersona Binary IDE API key cleared.",
      signInOpenedMessage: "Browser sign-in opened. Finish the flow in your browser.",
      signInCompletedMessage: "Browser sign-in complete.",
      signOutMessage: "Binary IDE auth cleared.",
    });
  }
}
