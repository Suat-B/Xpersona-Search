declare module "electron" {
  export const app: {
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
    quit(): void;
    getVersion(): string;
    getPath(name: string): string;
  };
  export class BrowserWindow {
    constructor(options: Record<string, unknown>);
    loadFile(path: string): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
    static getAllWindows(): BrowserWindow[];
  }
  export const dialog: {
    showOpenDialog(window: BrowserWindow, options: Record<string, unknown>): Promise<{
      canceled: boolean;
      filePaths: string[];
    }>;
  };
  export const ipcMain: {
    handle(channel: string, listener: (...args: unknown[]) => unknown): void;
  };
  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  };
  export const contextBridge: {
    exposeInMainWorld(name: string, api: Record<string, unknown>): void;
  };
  export const shell: {
    openExternal(url: string): Promise<void>;
  };
}
