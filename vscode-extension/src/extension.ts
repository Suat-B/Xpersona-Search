import * as vscode from "vscode";
import {
  EXTENSION_NAMESPACE,
  LEGACY_EXTENSION_NAMESPACE,
  WEBVIEW_VIEW_ID,
  migrateLegacyConfiguration,
  toWorkspaceRelativePath,
} from "./config";

type ExtensionServices = {
  auth: import("./auth").AuthManager;
  actionRunner: import("./actions").ActionRunner;
  provider: import("./webview-provider").PlaygroundViewProvider;
  indexManager: import("./indexer").CloudIndexManager;
};

class LazyPlaygroundViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly getServices: () => Promise<ExtensionServices>) {}

  resolveWebviewView(webviewView: vscode.WebviewView): Thenable<void> {
    return this.getServices().then(({ provider }) => provider.resolveWebviewView(webviewView));
  }
}

class LazyUriHandler implements vscode.UriHandler {
  constructor(private readonly getServices: () => Promise<ExtensionServices>) {}

  async handleUri(uri: vscode.Uri): Promise<void> {
    const { auth } = await this.getServices();
    await auth.handleUri(uri);
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const migrationPromise = migrateLegacyConfiguration().catch(() => undefined);
  let servicesPromise: Promise<ExtensionServices> | null = null;

  const getServices = async (): Promise<ExtensionServices> => {
    if (!servicesPromise) {
      servicesPromise = (async () => {
        await migrationPromise;

        const [
          { AuthManager },
          { ActionRunner },
          { ContextCollector },
          { SessionHistoryService },
          { CloudIndexManager },
          { QwenHistoryService },
          { QwenCodeRuntime },
          { ToolExecutor },
          { PlaygroundViewProvider },
        ] = await Promise.all([
          import("./auth"),
          import("./actions"),
          import("./context"),
          import("./history"),
          import("./indexer"),
          import("./qwen-history"),
          import("./qwen-code-runtime"),
          import("./tool-executor"),
          import("./webview-provider"),
        ]);

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

  const withProvider = async <T>(run: (provider: ExtensionServices["provider"]) => Promise<T>): Promise<T> => {
    const { provider } = await getServices();
    return await run(provider);
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WEBVIEW_VIEW_ID, new LazyPlaygroundViewProvider(getServices)),
    vscode.window.registerUriHandler(new LazyUriHandler(getServices)),
    vscode.commands.registerCommand("binary.generate", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await withProvider((provider) => provider.runBinaryGenerate());
        return;
      }
      const selected = editor.selection.isEmpty
        ? editor.document.lineAt(editor.selection.active.line).text
        : editor.document.getText(editor.selection);
      const { buildSelectionPrefill } = await import("./selection-prefill");
      await withProvider((provider) =>
        provider.runBinaryGenerate(
          buildSelectionPrefill({
            path: toWorkspaceRelativePath(editor.document.uri),
            line: editor.selection.start.line + 1,
            selectedText: selected.trim(),
          })
        )
      );
    }),
    vscode.commands.registerCommand("binary.validate", async () => {
      await withProvider((provider) => provider.runBinaryValidate());
    }),
    vscode.commands.registerCommand("binary.deploy", async () => {
      await withProvider((provider) => provider.runBinaryDeploy());
    }),
    vscode.commands.registerCommand("binary.configure", async () => {
      await withProvider((provider) => provider.openBinaryConfiguration());
    }),
    vscode.commands.registerCommand("xpersona.playground.prompt", async () => {
      await withProvider((provider) => provider.show());
    }),
    vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selected = editor.selection.isEmpty
        ? editor.document.lineAt(editor.selection.active.line).text
        : editor.document.getText(editor.selection);
      const { buildSelectionPrefill } = await import("./selection-prefill");
      await withProvider((provider) =>
        provider.show(
          buildSelectionPrefill({
            path: toWorkspaceRelativePath(editor.document.uri),
            line: editor.selection.start.line + 1,
            selectedText: selected.trim(),
          })
        )
      );
    }),
    vscode.commands.registerCommand("xpersona.playground.setApiKey", async () => {
      await withProvider((provider) => provider.openBinaryConfiguration());
    }),
    vscode.commands.registerCommand("xpersona.playground.signIn", async () => {
      const { auth } = await getServices();
      await auth.signInWithBrowser();
    }),
    vscode.commands.registerCommand("xpersona.playground.signOut", async () => {
      const { auth, provider } = await getServices();
      await auth.signOut();
      await provider.newChat();
    }),
    vscode.commands.registerCommand("xpersona.playground.undoLastChanges", async () => {
      const { actionRunner } = await getServices();
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
        if (!servicesPromise) return;
        void servicesPromise.then(({ provider }) => provider.refreshConfiguration()).catch(() => undefined);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!servicesPromise) return;
      void servicesPromise
        .then(({ indexManager }) => {
          if (!indexManager.shouldTrackUri(document.uri)) return;
          indexManager.scheduleRebuild();
        })
        .catch(() => undefined);
    }),
    vscode.workspace.onDidCreateFiles((event) => {
      if (!servicesPromise) return;
      void servicesPromise
        .then(({ indexManager }) => {
          if (!event.files.some((uri) => indexManager.shouldTrackUri(uri))) return;
          indexManager.scheduleRebuild();
        })
        .catch(() => undefined);
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      if (!servicesPromise) return;
      void servicesPromise
        .then(({ indexManager }) => {
          if (!event.files.some((uri) => indexManager.shouldTrackUri(uri))) return;
          indexManager.scheduleRebuild();
        })
        .catch(() => undefined);
    }),
    vscode.workspace.onDidRenameFiles((event) => {
      if (!servicesPromise) return;
      void servicesPromise
        .then(({ indexManager }) => {
          const touchedTrackedUri = event.files.some(
            (entry) => indexManager.shouldTrackUri(entry.oldUri) || indexManager.shouldTrackUri(entry.newUri)
          );
          if (!touchedTrackedUri) return;
          indexManager.scheduleRebuild();
        })
        .catch(() => undefined);
    })
  );
}

export function deactivate(): void {}
