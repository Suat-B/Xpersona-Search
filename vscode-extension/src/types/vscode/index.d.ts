declare module "vscode" {
  export interface Thenable<T> extends PromiseLike<T> {}

  export interface ExtensionContext {
    subscriptions: { push: (...items: unknown[]) => unknown };
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

  export namespace commands {
    function registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown
    ): unknown;
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
  }
}
