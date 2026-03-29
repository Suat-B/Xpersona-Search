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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
const selection_prefill_1 = require("./selection-prefill");
class LazyCutieViewProvider {
    constructor(getServices) {
        this.getServices = getServices;
    }
    resolveWebviewView(webviewView) {
        return this.getServices().then(({ provider }) => provider.resolveWebviewView(webviewView));
    }
}
class LazyCutieUriHandler {
    constructor(getServices) {
        this.getServices = getServices;
    }
    async handleUri(uri) {
        const { auth } = await this.getServices();
        await auth.handleUri(uri);
    }
}
/**
 * Thin entry: keeps the initial CommonJS load small so the host does not parse/evaluate
 * the full Cutie graph until the user actually opens the view or invokes a command.
 */
async function activate(context) {
    let servicesPromise = null;
    const getServices = async () => {
        if (!servicesPromise) {
            servicesPromise = (async () => {
                const { createCutieProductServices } = await Promise.resolve().then(() => __importStar(require("./extension-main")));
                const services = createCutieProductServices(context);
                setTimeout(() => services.provider.startBackgroundWarmup(), 0);
                return services;
            })().catch((error) => {
                servicesPromise = null;
                throw error;
            });
        }
        return await servicesPromise;
    };
    const withProvider = async (run) => {
        const { provider } = await getServices();
        return await run(provider);
    };
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(config_1.VIEW_ID, new LazyCutieViewProvider(getServices)), vscode.window.registerUriHandler(new LazyCutieUriHandler(getServices)), vscode.commands.registerCommand("cutie-product.startChat", async () => withProvider((provider) => provider.show())), vscode.commands.registerCommand("cutie-product.captureScreen", async () => withProvider((provider) => provider.captureScreen())), vscode.commands.registerCommand("cutie-product.setApiKey", async () => {
        const { auth } = await getServices();
        await auth.setApiKeyInteractive();
    }), vscode.commands.registerCommand("cutie-product.signIn", async () => {
        const { auth } = await getServices();
        await auth.signInWithBrowser();
    }), vscode.commands.registerCommand("cutie-product.signOut", async () => {
        const { auth, provider } = await getServices();
        await auth.signOut();
        provider.stopBinaryStreamsForSignOut();
        await provider.newChat();
    }), vscode.commands.registerCommand("cutie-product.stopAutomation", async () => withProvider((provider) => provider.stopAutomation())), vscode.commands.registerCommand("cutie-product.binary.generate", async () => {
        const editor = vscode.window.activeTextEditor;
        let prefill;
        if (editor) {
            const rel = (0, config_1.toWorkspaceRelativePath)(editor.document.uri);
            const line = editor.selection.active.line + 1;
            const selectedText = editor.selection.isEmpty
                ? editor.document.lineAt(editor.selection.active.line).text
                : editor.document.getText(editor.selection);
            const fromSelection = (0, selection_prefill_1.buildSelectionPrefill)({
                path: rel || undefined,
                line,
                selectedText,
            });
            prefill = fromSelection.trim() || selectedText.trim() || undefined;
        }
        await withProvider((provider) => provider.runBinaryGenerateFromEditor(prefill));
    }), vscode.commands.registerCommand("cutie-product.undoLastPlaygroundChanges", async () => withProvider((provider) => provider.undoLastPlaygroundBatchCommand())), vscode.commands.registerCommand("cutie-product.binary.validate", async () => withProvider((provider) => provider.runBinaryValidateCommand())), vscode.commands.registerCommand("cutie-product.binary.deploy", async () => withProvider((provider) => provider.runBinaryDeployCommand())), vscode.commands.registerCommand("cutie-product.binary.configure", async () => withProvider((provider) => provider.openBinaryConfigureCommand())));
}
function deactivate() { }
//# sourceMappingURL=extension-entry.js.map