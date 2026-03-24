"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieAuthManager = void 0;
const vscode_core_1 = require("@xpersona/vscode-core");
const config_1 = require("./config");
class CutieAuthManager extends vscode_core_1.HostedAuthManager {
    constructor(context) {
        super({
            context,
            getBaseApiUrl: config_1.getBaseApiUrl,
            extensionUriAuthority: "cutie-product.cutie-product",
            apiKeySecret: config_1.API_KEY_SECRET,
            legacyApiKeySecrets: [],
            refreshTokenSecret: config_1.REFRESH_TOKEN_SECRET,
            pendingPkceKey: config_1.PENDING_PKCE_KEY,
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
exports.CutieAuthManager = CutieAuthManager;
//# sourceMappingURL=auth.js.map