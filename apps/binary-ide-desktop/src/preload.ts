import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("binaryDesktop", {
  runtimeInfo: () => ipcRenderer.invoke("binary:runtime-info"),
  chooseWorkspace: () => ipcRenderer.invoke("binary:choose-workspace"),
  openExternal: (url: string) => ipcRenderer.invoke("binary:open-external", url),
});
