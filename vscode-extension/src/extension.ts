import * as vscode from "vscode";
import { AuthManager } from "./auth";
import { ActionRunner } from "./actions";
import { ContextCollector } from "./context";
import { WEBVIEW_VIEW_ID } from "./config";
import { SessionHistoryService } from "./history";
import { CloudIndexManager } from "./indexer";
import { PlaygroundViewProvider } from "./webview-provider";

export function activate(context: vscode.ExtensionContext): void {
  const auth = new AuthManager(context);
  const indexManager = new CloudIndexManager(context, () => auth.getRequestAuth());
  const actionRunner = new ActionRunner();
  const contextCollector = new ContextCollector(indexManager);
  const historyService = new SessionHistoryService();
  const provider = new PlaygroundViewProvider(
    context,
    auth,
    historyService,
    contextCollector,
    actionRunner,
    indexManager
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WEBVIEW_VIEW_ID, provider),
    vscode.window.registerUriHandler(auth),
    vscode.commands.registerCommand("xpersona.playground.prompt", async () => {
      await provider.show();
    }),
    vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selected = editor.selection.isEmpty
        ? editor.document.lineAt(editor.selection.active.line).text
        : editor.document.getText(editor.selection);
      await provider.show(selected.trim());
    }),
    vscode.commands.registerCommand("xpersona.playground.setApiKey", async () => {
      await auth.setApiKeyInteractive();
      await provider.refreshHistory();
    }),
    vscode.commands.registerCommand("xpersona.playground.signIn", async () => {
      await auth.signInWithBrowser();
    }),
    vscode.commands.registerCommand("xpersona.playground.signOut", async () => {
      await auth.signOut();
      await provider.newChat();
    }),
    vscode.commands.registerCommand("xpersona.playground.undoLastChanges", async () => {
      const summary = await actionRunner.undoLastBatch();
      vscode.window.showInformationMessage(summary);
    }),
    vscode.workspace.onDidSaveTextDocument(() => indexManager.scheduleRebuild()),
    vscode.workspace.onDidCreateFiles(() => indexManager.scheduleRebuild()),
    vscode.workspace.onDidDeleteFiles(() => indexManager.scheduleRebuild()),
    vscode.workspace.onDidRenameFiles(() => indexManager.scheduleRebuild())
  );

  indexManager.start();
}

export function deactivate(): void {}
