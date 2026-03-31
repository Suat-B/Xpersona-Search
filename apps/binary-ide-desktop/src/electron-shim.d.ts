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
    show(): void;
    hide(): void;
    close(): void;
    focus(): void;
    isVisible(): boolean;
    isDestroyed(): boolean;
    getBounds(): { x: number; y: number; width: number; height: number };
    setBounds(bounds: { x?: number; y?: number; width?: number; height?: number }): void;
    setAspectRatio(ratio: number): void;
    setAlwaysOnTop(flag: boolean, level?: string): void;
    setIgnoreMouseEvents(flag: boolean, options?: { forward?: boolean }): void;
    setSkipTaskbar(flag: boolean): void;
    setVisibleOnAllWorkspaces(flag: boolean, options?: Record<string, unknown>): void;
    webContents: {
      send(channel: string, payload: unknown): void;
    };
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
    on(channel: string, listener: (...args: unknown[]) => void): void;
    removeListener(channel: string, listener: (...args: unknown[]) => void): void;
  };

  export const contextBridge: {
    exposeInMainWorld(name: string, api: Record<string, unknown>): void;
  };

  export const shell: {
    openExternal(url: string): Promise<void>;
  };

  export const globalShortcut: {
    register(accelerator: string, callback: () => void): boolean;
    unregisterAll(): void;
  };

  export const screen: {
    getPrimaryDisplay(): {
      workArea: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
  };

  const electron: {
    app: typeof app;
    BrowserWindow: typeof BrowserWindow;
    dialog: typeof dialog;
    ipcMain: typeof ipcMain;
    ipcRenderer: typeof ipcRenderer;
    contextBridge: typeof contextBridge;
    shell: typeof shell;
    globalShortcut: typeof globalShortcut;
    screen: typeof screen;
  };

  export default electron;
}
