import * as vscode from "vscode";
import { HostedAuthManager } from "@xpersona/vscode-core";
import { API_KEY_SECRET, PENDING_PKCE_KEY, REFRESH_TOKEN_SECRET, getBaseApiUrl } from "./config";

export class CutieAuthManager extends HostedAuthManager {
  constructor(context: vscode.ExtensionContext) {
    super({
      context,
      getBaseApiUrl,
      extensionUriAuthority: "cutie-product.cutie-product",
      apiKeySecret: API_KEY_SECRET,
      legacyApiKeySecrets: [],
      refreshTokenSecret: REFRESH_TOKEN_SECRET,
      pendingPkceKey: PENDING_PKCE_KEY,
      productLabel: "Xpersona Cutie",
      apiKeyTitle: "Set Xpersona API Key",
      apiKeyPrompt: "Paste your hosted Xpersona API key for Cutie",
      apiKeySavedMessage: "Xpersona API key saved for Cutie.",
      apiKeyClearedMessage: "Xpersona API key cleared for Cutie.",
      signInOpenedMessage: "Browser sign-in opened for Cutie. Finish the flow in your browser.",
      signInCompletedMessage: "Cutie browser sign-in complete.",
      signOutMessage: "Cutie auth cleared.",
    });
  }
}
