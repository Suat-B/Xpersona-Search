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
class LazyPlaygroundViewProvider {
    constructor(getServices) {
        this.getServices = getServices;
    }
    resolveWebviewView(webviewView) {
        return this.getServices().then(({ provider }) => provider.resolveWebviewView(webviewView));
    }
}
class LazyUriHandler {
    constructor(getServices) {
        this.getServices = getServices;
    }
    async handleUri(uri) {
        const { auth } = await this.getServices();
        await auth.handleUri(uri);
    }
}
async function activate(context) {
    const migrationPromise = (0, config_1.migrateLegacyConfiguration)().catch(() => undefined);
    let servicesPromise = null;
    const getServices = async () => {
        if (!servicesPromise) {
            servicesPromise = (async () => {
                await migrationPromise;
                const [{ AuthManager }, { ActionRunner }, { ContextCollector }, { SessionHistoryService }, { CloudIndexManager }, { QwenHistoryService }, { QwenCodeRuntime }, { ToolExecutor }, { PlaygroundViewProvider },] = await Promise.all([
                    Promise.resolve().then(() => __importStar(require("./auth"))),
                    Promise.resolve().then(() => __importStar(require("./actions"))),
                    Promise.resolve().then(() => __importStar(require("./context"))),
                    Promise.resolve().then(() => __importStar(require("./history"))),
                    Promise.resolve().then(() => __importStar(require("./indexer"))),
                    Promise.resolve().then(() => __importStar(require("./qwen-history"))),
                    Promise.resolve().then(() => __importStar(require("./qwen-code-runtime"))),
                    Promise.resolve().then(() => __importStar(require("./tool-executor"))),
                    Promise.resolve().then(() => __importStar(require("./webview-provider"))),
                ]);
                const auth = new AuthManager(context);
                const indexManager = new CloudIndexManager(context, () => auth.getRequestAuth());
                const actionRunner = new ActionRunner();
                const toolExecutor = new ToolExecutor(actionRunner, indexManager);
                const contextCollector = new ContextCollector(indexManager);
                const historyService = new SessionHistoryService();
                const qwenHistoryService = new QwenHistoryService(context);
                const qwenCodeRuntime = new QwenCodeRuntime();
                const provider = new PlaygroundViewProvider(context, auth, historyService, qwenHistoryService, qwenCodeRuntime, contextCollector, actionRunner, toolExecutor, indexManager);
                toolExecutor.setBinaryToolContextProvider(() => provider.getBinaryToolContext());
                indexManager.start();
                return {
                    auth,
                    actionRunner,
                    provider,
                    indexManager,
                };
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
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(config_1.WEBVIEW_VIEW_ID, new LazyPlaygroundViewProvider(getServices)), vscode.window.registerUriHandler(new LazyUriHandler(getServices)), vscode.commands.registerCommand("binary.generate", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            await withProvider((provider) => provider.runBinaryGenerate());
            return;
        }
        const selected = editor.selection.isEmpty
            ? editor.document.lineAt(editor.selection.active.line).text
            : editor.document.getText(editor.selection);
        const { buildSelectionPrefill } = await Promise.resolve().then(() => __importStar(require("./selection-prefill")));
        await withProvider((provider) => provider.runBinaryGenerate(buildSelectionPrefill({
            path: (0, config_1.toWorkspaceRelativePath)(editor.document.uri),
            line: editor.selection.start.line + 1,
            selectedText: selected.trim(),
        })));
    }), vscode.commands.registerCommand("binary.validate", async () => {
        await withProvider((provider) => provider.runBinaryValidate());
    }), vscode.commands.registerCommand("binary.deploy", async () => {
        await withProvider((provider) => provider.runBinaryDeploy());
    }), vscode.commands.registerCommand("binary.configure", async () => {
        await withProvider((provider) => provider.openBinaryConfiguration());
    }), vscode.commands.registerCommand("xpersona.playground.prompt", async () => {
        await withProvider((provider) => provider.show());
    }), vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const selected = editor.selection.isEmpty
            ? editor.document.lineAt(editor.selection.active.line).text
            : editor.document.getText(editor.selection);
        const { buildSelectionPrefill } = await Promise.resolve().then(() => __importStar(require("./selection-prefill")));
        await withProvider((provider) => provider.show(buildSelectionPrefill({
            path: (0, config_1.toWorkspaceRelativePath)(editor.document.uri),
            line: editor.selection.start.line + 1,
            selectedText: selected.trim(),
        })));
    }), vscode.commands.registerCommand("xpersona.playground.setApiKey", async () => {
        await withProvider((provider) => provider.openBinaryConfiguration());
    }), vscode.commands.registerCommand("xpersona.playground.signIn", async () => {
        const { auth } = await getServices();
        await auth.signInWithBrowser();
    }), vscode.commands.registerCommand("xpersona.playground.signOut", async () => {
        const { auth, provider } = await getServices();
        await auth.signOut();
        await provider.newChat();
    }), vscode.commands.registerCommand("xpersona.playground.undoLastChanges", async () => {
        const { actionRunner } = await getServices();
        const summary = await actionRunner.undoLastBatch();
        vscode.window.showInformationMessage(summary);
    }), vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(`${config_1.EXTENSION_NAMESPACE}.runtime`) ||
            event.affectsConfiguration(`${config_1.EXTENSION_NAMESPACE}.agent.modelAlias`) ||
            event.affectsConfiguration(`${config_1.EXTENSION_NAMESPACE}.agent.rollbackLocalRuntime`) ||
            event.affectsConfiguration(`${config_1.EXTENSION_NAMESPACE}.baseApiUrl`) ||
            event.affectsConfiguration(`${config_1.EXTENSION_NAMESPACE}.cutie.model`) ||
            event.affectsConfiguration(`${config_1.EXTENSION_NAMESPACE}.qwen.model`) ||
            event.affectsConfiguration(`${config_1.EXTENSION_NAMESPACE}.qwen.baseUrl`) ||
            event.affectsConfiguration(`${config_1.EXTENSION_NAMESPACE}.qwen.executable`) ||
            event.affectsConfiguration(`${config_1.LEGACY_EXTENSION_NAMESPACE}.runtime`) ||
            event.affectsConfiguration(`${config_1.LEGACY_EXTENSION_NAMESPACE}.agent.modelAlias`) ||
            event.affectsConfiguration(`${config_1.LEGACY_EXTENSION_NAMESPACE}.agent.rollbackLocalRuntime`) ||
            event.affectsConfiguration(`${config_1.LEGACY_EXTENSION_NAMESPACE}.baseApiUrl`) ||
            event.affectsConfiguration(`${config_1.LEGACY_EXTENSION_NAMESPACE}.cutie.model`) ||
            event.affectsConfiguration(`${config_1.LEGACY_EXTENSION_NAMESPACE}.qwen.model`) ||
            event.affectsConfiguration(`${config_1.LEGACY_EXTENSION_NAMESPACE}.qwen.baseUrl`) ||
            event.affectsConfiguration(`${config_1.LEGACY_EXTENSION_NAMESPACE}.qwen.executable`)) {
            if (!servicesPromise)
                return;
            void servicesPromise.then(({ provider }) => provider.refreshConfiguration()).catch(() => undefined);
        }
    }), vscode.workspace.onDidSaveTextDocument((document) => {
        if (!servicesPromise)
            return;
        void servicesPromise
            .then(({ indexManager }) => {
            if (!indexManager.shouldTrackUri(document.uri))
                return;
            indexManager.scheduleRebuild();
        })
            .catch(() => undefined);
    }), vscode.workspace.onDidCreateFiles((event) => {
        if (!servicesPromise)
            return;
        void servicesPromise
            .then(({ indexManager }) => {
            if (!event.files.some((uri) => indexManager.shouldTrackUri(uri)))
                return;
            indexManager.scheduleRebuild();
        })
            .catch(() => undefined);
    }), vscode.workspace.onDidDeleteFiles((event) => {
        if (!servicesPromise)
            return;
        void servicesPromise
            .then(({ indexManager }) => {
            if (!event.files.some((uri) => indexManager.shouldTrackUri(uri)))
                return;
            indexManager.scheduleRebuild();
        })
            .catch(() => undefined);
    }), vscode.workspace.onDidRenameFiles((event) => {
        if (!servicesPromise)
            return;
        void servicesPromise
            .then(({ indexManager }) => {
            const touchedTrackedUri = event.files.some((entry) => indexManager.shouldTrackUri(entry.oldUri) || indexManager.shouldTrackUri(entry.newUri));
            if (!touchedTrackedUri)
                return;
            indexManager.scheduleRebuild();
        })
            .catch(() => undefined);
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map