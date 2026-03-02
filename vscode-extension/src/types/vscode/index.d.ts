declare module "vscode" {
  export interface Thenable<T> extends PromiseLike<T> {}

  export interface Disposable {
    dispose(): any;
  }

  export interface ExtensionContext {
    subscriptions: { push: (...items: Disposable[]) => unknown };
  }

  export interface TextDocument {
    getText(range?: unknown): string;
    lineAt(line: number): { text: string };
  }
  export interface TextEditor {
    document: TextDocument;
    selection: Selection;
  }
  export interface Selection {
    isEmpty: boolean;
    active: { line: number };
  }

  export class Uri {
    static parse(value: string): Uri;
  }

  export interface Webview {
    html: string;
    options?: {
      enableCommandUris?: boolean;
    };
  }

  export interface WebviewView {
    webview: Webview;
  }

  export interface WebviewViewProvider {
    resolveWebviewView(webviewView: WebviewView): void | Thenable<void>;
  }

  export namespace commands {
    function registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown
    ): Disposable;
  }

  export namespace env {
    function openExternal(target: Uri): Thenable<boolean>;
  }

  export namespace workspace {
    function openTextDocument(options: {
      language?: string;
      content?: string;
    }): Thenable<TextDocument>;
    function getConfiguration(section?: string): {
      get<T>(name: string): T | undefined;
    };
  }

  export namespace window {
    const activeTextEditor: TextEditor | undefined;
    function showTextDocument(
      doc: TextDocument,
      options?: { preview?: boolean }
    ): Thenable<TextEditor>;
    function showErrorMessage(message: string): Thenable<string | undefined>;
    function registerWebviewViewProvider(
      viewId: string,
      provider: WebviewViewProvider
    ): Disposable;
  }
}
