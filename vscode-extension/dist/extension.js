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
function activate(context) {
    const openPlayground = vscode.commands.registerCommand("xpersona.playground.run", async () => {
        const url = getBaseUrl();
        await vscode.env.openExternal(vscode.Uri.parse(url));
    });
    const newPrompt = vscode.commands.registerCommand("xpersona.playground.prompt", async () => {
        const content = [
            "System: You are an elite code assistant.",
            "User: Describe the task you want to solve in Playground.",
            "",
            "Context:",
            "- Repo:",
            "- Goal:",
            "- Constraints:",
            "",
            "Desired output:",
            "-",
        ].join("\n");
        try {
            const doc = await vscode.workspace.openTextDocument({
                language: "markdown",
                content,
            });
            await vscode.window.showTextDocument(doc, { preview: false });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unable to open prompt";
            await vscode.window.showErrorMessage(message);
        }
    });
    const openWithSelection = vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
        const baseUrl = getBaseUrl();
        const prompt = getSelectionOrLine();
        if (!prompt) {
            await vscode.env.openExternal(vscode.Uri.parse(baseUrl));
            return;
        }
        const url = withPrompt(baseUrl, prompt);
        await vscode.env.openExternal(vscode.Uri.parse(url));
    });
    context.subscriptions.push(openPlayground, newPrompt, openWithSelection);
}
function deactivate() {
    return;
}
function getBaseUrl() {
    const config = vscode.workspace.getConfiguration("xpersona.playground");
    const configured = config.get("baseUrl");
    if (configured && configured.trim().length > 0) {
        return configured.trim();
    }
    return "https://xpersona.co/playground";
}
function getSelectionOrLine() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return undefined;
    const selection = editor.selection;
    const selected = selection.isEmpty ? "" : editor.document.getText(selection).trim();
    if (selected)
        return selected;
    const lineText = editor.document.lineAt(selection.active.line).text.trim();
    return lineText.length > 0 ? lineText : undefined;
}
function withPrompt(baseUrl, prompt) {
    try {
        const url = new URL(baseUrl);
        url.searchParams.set("prompt", prompt);
        return url.toString();
    }
    catch {
        const joiner = baseUrl.includes("?") ? "&" : "?";
        return `${baseUrl}${joiner}prompt=${encodeURIComponent(prompt)}`;
    }
}
//# sourceMappingURL=extension.js.map