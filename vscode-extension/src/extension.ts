import * as vscode from "vscode";
import { AuthManager } from "./auth";
import { ActionRunner } from "./actions";
import { ContextCollector } from "./context";
import { LEGACY_EXTENSION_NAMESPACE, WEBVIEW_VIEW_ID, EXTENSION_NAMESPACE, migrateLegacyConfiguration, toWorkspaceRelativePath } from "./config";
import { SessionHistoryService } from "./history";
import { CloudIndexManager } from "./indexer";
import { QwenHistoryService } from "./qwen-history";
import { QwenCodeRuntime } from "./qwen-code-runtime";
import { buildSelectionPrefill } from "./selection-prefill";
import { ToolExecutor } from "./tool-executor";
import { PlaygroundViewProvider } from "./webview-provider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await migrateLegacyConfiguration().catch(() => undefined);
  const auth = new AuthManager(context);
  const indexManager = new CloudIndexManager(context, () => auth.getRequestAuth());
  const actionRunner = new ActionRunner();
  const toolExecutor = new ToolExecutor(actionRunner, indexManager);
  const contextCollector = new ContextCollector(indexManager);
  const historyService = new SessionHistoryService();
  const qwenHistoryService = new QwenHistoryService(context);
  const qwenCodeRuntime = new QwenCodeRuntime();
  const provider = new PlaygroundViewProvider(
    context,
    auth,
    historyService,
    qwenHistoryService,
    qwenCodeRuntime,
    contextCollector,
    actionRunner,
    toolExecutor,
    indexManager
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WEBVIEW_VIEW_ID, provider),
    vscode.window.registerUriHandler(auth),
    vscode.commands.registerCommand("binary.generate", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await provider.runBinaryGenerate();
        return;
      }
      const selected = editor.selection.isEmpty
        ? editor.document.lineAt(editor.selection.active.line).text
        : editor.document.getText(editor.selection);
      await provider.runBinaryGenerate(
        buildSelectionPrefill({
          path: toWorkspaceRelativePath(editor.document.uri),
          line: editor.selection.start.line + 1,
          selectedText: selected.trim(),
        })
      );
    }),
    vscode.commands.registerCommand("binary.validate", async () => {
      await provider.runBinaryValidate();
    }),
    vscode.commands.registerCommand("binary.deploy", async () => {
      await provider.runBinaryDeploy();
    }),
    vscode.commands.registerCommand("binary.configure", async () => {
      await provider.openBinaryConfiguration();
    }),
    vscode.commands.registerCommand("xpersona.playground.prompt", async () => {
      await provider.show();
    }),
    vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selected = editor.selection.isEmpty
        ? editor.document.lineAt(editor.selection.active.line).text
        : editor.document.getText(editor.selection);
      await provider.show(
        buildSelectionPrefill({
          path: toWorkspaceRelativePath(editor.document.uri),
          line: editor.selection.start.line + 1,
          selectedText: selected.trim(),
        })
      );
    }),
    vscode.commands.registerCommand("xpersona.playground.setApiKey", async () => {
      await provider.openBinaryConfiguration();
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
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(`${EXTENSION_NAMESPACE}.runtime`) ||
        event.affectsConfiguration(`${EXTENSION_NAMESPACE}.agent.modelAlias`) ||
        event.affectsConfiguration(`${EXTENSION_NAMESPACE}.agent.rollbackLocalRuntime`) ||
        event.affectsConfiguration(`${EXTENSION_NAMESPACE}.baseApiUrl`) ||
        event.affectsConfiguration(`${EXTENSION_NAMESPACE}.cutie.model`) ||
        event.affectsConfiguration(`${EXTENSION_NAMESPACE}.qwen.model`) ||
        event.affectsConfiguration(`${EXTENSION_NAMESPACE}.qwen.baseUrl`) ||
        event.affectsConfiguration(`${EXTENSION_NAMESPACE}.qwen.executable`) ||
        event.affectsConfiguration(`${LEGACY_EXTENSION_NAMESPACE}.runtime`) ||
        event.affectsConfiguration(`${LEGACY_EXTENSION_NAMESPACE}.agent.modelAlias`) ||
        event.affectsConfiguration(`${LEGACY_EXTENSION_NAMESPACE}.agent.rollbackLocalRuntime`) ||
        event.affectsConfiguration(`${LEGACY_EXTENSION_NAMESPACE}.baseApiUrl`) ||
        event.affectsConfiguration(`${LEGACY_EXTENSION_NAMESPACE}.cutie.model`) ||
        event.affectsConfiguration(`${LEGACY_EXTENSION_NAMESPACE}.qwen.model`) ||
        event.affectsConfiguration(`${LEGACY_EXTENSION_NAMESPACE}.qwen.baseUrl`) ||
        event.affectsConfiguration(`${LEGACY_EXTENSION_NAMESPACE}.qwen.executable`)
      ) {
        void provider.refreshConfiguration();
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!indexManager.shouldTrackUri(document.uri)) return;
      indexManager.scheduleRebuild();
    }),
    vscode.workspace.onDidCreateFiles((event) => {
      if (!event.files.some((uri) => indexManager.shouldTrackUri(uri))) return;
      indexManager.scheduleRebuild();
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      if (!event.files.some((uri) => indexManager.shouldTrackUri(uri))) return;
      indexManager.scheduleRebuild();
    }),
    vscode.workspace.onDidRenameFiles((event) => {
      const touchedTrackedUri = event.files.some(
        (entry) => indexManager.shouldTrackUri(entry.oldUri) || indexManager.shouldTrackUri(entry.newUri)
      );
      if (!touchedTrackedUri) return;
      indexManager.scheduleRebuild();
    })
  );

  indexManager.start();
}

export function deactivate(): void {}
