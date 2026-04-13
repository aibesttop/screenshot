import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:update", patch),

  // Uploads
  getUploadHistory: (limit: number) =>
    ipcRenderer.invoke("uploads:history", limit),
  deleteUpload: (id: string) => ipcRenderer.invoke("uploads:delete", id),
  uploadFile: (filepath: string) => ipcRenderer.invoke("uploads:file", filepath),
  uploadClipboard: () => ipcRenderer.invoke("uploads:clipboard"),

  // Events (main → renderer)
  onUploadStart: (cb: (data: { filepath: string }) => void) => {
    const handler = (_event: unknown, data: { filepath: string }) => cb(data);
    ipcRenderer.on("upload:start", handler);
    return () => ipcRenderer.removeListener("upload:start", handler);
  },
  onUploadComplete: (
    cb: (data: { id: string; url: string; filepath: string }) => void
  ) => {
    const handler = (
      _event: unknown,
      data: { id: string; url: string; filepath: string }
    ) => cb(data);
    ipcRenderer.on("upload:complete", handler);
    return () => ipcRenderer.removeListener("upload:complete", handler);
  },
  onUploadError: (cb: (err: { code: string; message: string }) => void) => {
    const handler = (
      _event: unknown,
      err: { code: string; message: string }
    ) => cb(err);
    ipcRenderer.on("upload:error", handler);
    return () => ipcRenderer.removeListener("upload:error", handler);
  },

  // Auth
  loginWithBrowser: () => ipcRenderer.invoke("auth:login"),
  logout: () => ipcRenderer.invoke("auth:logout"),

  // System
  openUrl: (url: string) => ipcRenderer.invoke("system:openUrl", url),
  showItemInFolder: (filepath: string) =>
    ipcRenderer.invoke("system:reveal", filepath),
  platform: process.platform,
  version: "1.0.0",
};

contextBridge.exposeInMainWorld("snaplink", api);

// Type declaration for renderer
export type SnapLinkAPI = typeof api;
