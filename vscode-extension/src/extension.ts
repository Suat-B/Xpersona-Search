import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open prompt";
      await vscode.window.showErrorMessage(message);
    }
  });
  const openWithSelection = vscode.commands.registerCommand(
    "xpersona.playground.openWithSelection",
    async () => {
      const baseUrl = getBaseUrl();
      const prompt = getSelectionOrLine();
      if (!prompt) {
        await vscode.env.openExternal(vscode.Uri.parse(baseUrl));
        return;
      }
      const url = withPrompt(baseUrl, prompt);
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  );
  context.subscriptions.push(openPlayground, newPrompt, openWithSelection);
}

export function deactivate() {
  return;
}

function getBaseUrl(): string {
  const config = vscode.workspace.getConfiguration("xpersona.playground");
  const configured = config.get<string>("baseUrl");
  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }
  return "https://xpersona.co/playground";
}

function getSelectionOrLine(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const selection = editor.selection;
  const selected = selection.isEmpty ? "" : editor.document.getText(selection).trim();
  if (selected) return selected;
  const lineText = editor.document.lineAt(selection.active.line).text.trim();
  return lineText.length > 0 ? lineText : undefined;
}

function withPrompt(baseUrl: string, prompt: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("prompt", prompt);
    return url.toString();
  } catch {
    const joiner = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${joiner}prompt=${encodeURIComponent(prompt)}`;
  }
}
