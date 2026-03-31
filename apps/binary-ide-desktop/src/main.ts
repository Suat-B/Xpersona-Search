import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const rendererPath = path.join(packageRoot, "dist", "renderer", "index.html");
const defaultHostUrl = process.env.BINARY_IDE_LOCAL_HOST_URL || "http://127.0.0.1:7777";
const hostEntry = process.env.BINARY_IDE_HOST_ENTRY || path.join(repoRoot, "services", "binary-host", "dist", "server.js");

let hostProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

function startBinaryHost(): void {
  if (hostProcess) return;
  const child = spawn(process.execPath, [hostEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BINARY_IDE_HOST_PORT: process.env.BINARY_IDE_HOST_PORT || "7777",
    },
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  hostProcess = child;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: "#0e1726",
    title: "Binary IDE",
    webPreferences: {
      preload: path.join(packageRoot, "dist", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  void mainWindow.loadFile(rendererPath);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("binary:runtime-info", () => {
  return {
    hostUrl: defaultHostUrl,
    appVersion: app.getVersion(),
    userDataPath: app.getPath("userData"),
  };
});

ipcMain.handle("binary:choose-workspace", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose a workspace for Binary IDE",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle("binary:open-external", async (_event, url: unknown) => {
  if (typeof url !== "string" || !url.trim()) return false;
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(() => {
  startBinaryHost();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
