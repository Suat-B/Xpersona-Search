import * as vscode from "vscode";
import { toWorkspaceRelativePath, VIEW_ID } from "./config";
import { buildSelectionPrefill } from "./selection-prefill";

type CutieServices = import("./extension-main").CutieProductServices;

class LazyCutieViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly getServices: () => Promise<CutieServices>) {}

  resolveWebviewView(webviewView: vscode.WebviewView): Thenable<void> {
    return this.getServices().then(({ provider }) => provider.resolveWebviewView(webviewView));
  }
}

class LazyCutieUriHandler implements vscode.UriHandler {
  constructor(private readonly getServices: () => Promise<CutieServices>) {}

  async handleUri(uri: vscode.Uri): Promise<void> {
    const { auth } = await this.getServices();
    await auth.handleUri(uri);
  }
}

/**
 * Thin entry: keeps the initial CommonJS load small so the host does not parse/evaluate
 * the full Cutie graph until the user actually opens the view or invokes a command.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  let servicesPromise: Promise<CutieServices> | null = null;

  const getServices = async (): Promise<CutieServices> => {
    if (!servicesPromise) {
      servicesPromise = (async () => {
        const { createCutieProductServices } = await import("./extension-main");
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

  const withProvider = async <T>(run: (provider: CutieServices["provider"]) => Promise<T>): Promise<T> => {
    const { provider } = await getServices();
    return await run(provider);
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, new LazyCutieViewProvider(getServices)),
    vscode.window.registerUriHandler(new LazyCutieUriHandler(getServices)),
    vscode.commands.registerCommand("cutie-product.startChat", async () => withProvider((provider) => provider.show())),
    vscode.commands.registerCommand("cutie-product.captureScreen", async () =>
      withProvider((provider) => provider.captureScreen())
    ),
    vscode.commands.registerCommand("cutie-product.setApiKey", async () => {
      const { auth } = await getServices();
      await auth.setApiKeyInteractive();
    }),
    vscode.commands.registerCommand("cutie-product.signIn", async () => {
      const { auth } = await getServices();
      await auth.signInWithBrowser();
    }),
    vscode.commands.registerCommand("cutie-product.signOut", async () => {
      const { auth, provider } = await getServices();
      await auth.signOut();
      provider.stopBinaryStreamsForSignOut();
      await provider.newChat();
    }),
    vscode.commands.registerCommand("cutie-product.stopAutomation", async () =>
      withProvider((provider) => provider.stopAutomation())
    ),
    vscode.commands.registerCommand("cutie-product.binary.generate", async () => {
      const editor = vscode.window.activeTextEditor;
      let prefill: string | undefined;
      if (editor) {
        const rel = toWorkspaceRelativePath(editor.document.uri);
        const line = editor.selection.active.line + 1;
        const selectedText = editor.selection.isEmpty
          ? editor.document.lineAt(editor.selection.active.line).text
          : editor.document.getText(editor.selection);
        const fromSelection = buildSelectionPrefill({
          path: rel || undefined,
          line,
          selectedText,
        });
        prefill = fromSelection.trim() || selectedText.trim() || undefined;
      }
      await withProvider((provider) => provider.runBinaryGenerateFromEditor(prefill));
    }),
    vscode.commands.registerCommand("cutie-product.undoLastPlaygroundChanges", async () =>
      withProvider((provider) => provider.undoLastPlaygroundBatchCommand())
    ),
    vscode.commands.registerCommand("cutie-product.binary.validate", async () =>
      withProvider((provider) => provider.runBinaryValidateCommand())
    ),
    vscode.commands.registerCommand("cutie-product.binary.deploy", async () =>
      withProvider((provider) => provider.runBinaryDeployCommand())
    ),
    vscode.commands.registerCommand("cutie-product.binary.configure", async () =>
      withProvider((provider) => provider.openBinaryConfigureCommand())
    )
  );
}

export function deactivate(): void {}
