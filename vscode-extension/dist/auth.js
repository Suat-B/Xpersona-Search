"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
const vscode_core_1 = require("@xpersona/vscode-core");
const config_1 = require("./config");
class AuthManager extends vscode_core_1.HostedAuthManager {
    constructor(context) {
        super({
            context,
            getBaseApiUrl: config_1.getBaseApiUrl,
            extensionUriAuthority: "playgroundai.xpersona-playground",
            apiKeySecret: config_1.API_KEY_SECRET,
            legacyApiKeySecrets: [config_1.API_KEY_LEGACY_SECRET],
            refreshTokenSecret: config_1.REFRESH_TOKEN_SECRET,
            pendingPkceKey: config_1.PENDING_PKCE_KEY,
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
exports.AuthManager = AuthManager;
//# sourceMappingURL=auth.js.map