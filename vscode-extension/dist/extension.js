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
const auth_1 = require("./auth");
const actions_1 = require("./actions");
const context_1 = require("./context");
const config_1 = require("./config");
const history_1 = require("./history");
const indexer_1 = require("./indexer");
const webview_provider_1 = require("./webview-provider");
function activate(context) {
    const auth = new auth_1.AuthManager(context);
    const indexManager = new indexer_1.CloudIndexManager(context, () => auth.getRequestAuth());
    const actionRunner = new actions_1.ActionRunner();
    const contextCollector = new context_1.ContextCollector(indexManager);
    const historyService = new history_1.SessionHistoryService();
    const provider = new webview_provider_1.PlaygroundViewProvider(context, auth, historyService, contextCollector, actionRunner, indexManager);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(config_1.WEBVIEW_VIEW_ID, provider), vscode.window.registerUriHandler(auth), vscode.commands.registerCommand("xpersona.playground.prompt", async () => {
        await provider.show();
    }), vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const selected = editor.selection.isEmpty
            ? editor.document.lineAt(editor.selection.active.line).text
            : editor.document.getText(editor.selection);
        await provider.show(selected.trim());
    }), vscode.commands.registerCommand("xpersona.playground.setApiKey", async () => {
        await auth.setApiKeyInteractive();
        await provider.refreshHistory();
    }), vscode.commands.registerCommand("xpersona.playground.signIn", async () => {
        await auth.signInWithBrowser();
    }), vscode.commands.registerCommand("xpersona.playground.signOut", async () => {
        await auth.signOut();
        await provider.newChat();
    }), vscode.commands.registerCommand("xpersona.playground.mode.auto", async () => {
        await provider.setMode("auto");
    }), vscode.commands.registerCommand("xpersona.playground.mode.plan", async () => {
        await provider.setMode("plan");
    }), vscode.commands.registerCommand("xpersona.playground.mode.yolo", async () => {
        await provider.setMode("yolo");
    }), vscode.commands.registerCommand("xpersona.playground.history.open", async () => {
        await provider.show();
        await provider.refreshHistory();
    }), vscode.commands.registerCommand("xpersona.playground.index.rebuild", async () => {
        await provider.show();
        await indexManager.rebuild("manual");
    }), vscode.commands.registerCommand("xpersona.playground.undoLastChanges", async () => {
        const summary = await actionRunner.undoLastBatch();
        vscode.window.showInformationMessage(summary);
    }), vscode.workspace.onDidSaveTextDocument(() => indexManager.scheduleRebuild()), vscode.workspace.onDidCreateFiles(() => indexManager.scheduleRebuild()), vscode.workspace.onDidDeleteFiles(() => indexManager.scheduleRebuild()), vscode.workspace.onDidRenameFiles(() => indexManager.scheduleRebuild()));
    indexManager.start();
}
function deactivate() { }
//# sourceMappingURL=extension.js.map