import { ipcMain, BrowserWindow } from "electron";
import { uploadFile, uploadClipboardImage } from "../services/uploader";
import { getClipboardImage } from "../services/clipboard";
import { getSettings } from "../services/store";

// In-memory recent uploads (persisted via IPC to renderer)
const recentUploads: Array<{
  id: string;
  url: string;
  filepath?: string;
  createdAt: string;
}> = [];
const MAX_RECENT = 50;

export function addRecentUpload(upload: {
  id: string;
  url: string;
  filepath?: string;
}) {
  recentUploads.unshift({
    ...upload,
    createdAt: new Date().toISOString(),
  });
  if (recentUploads.length > MAX_RECENT) {
    recentUploads.pop();
  }
}

export function getRecentUrls(): Array<{ id: string; url: string }> {
  return recentUploads.slice(0, 10).map(({ id, url }) => ({ id, url }));
}

export function registerUploadIPC() {
  ipcMain.handle("uploads:history", (_event, limit: number = 20) => {
    return recentUploads.slice(0, limit);
  });

  ipcMain.handle("uploads:delete", async (_event, id: string) => {
    const settings = getSettings();
    const apiUrl = settings.uploadEndpoint;

    try {
      const axios = (await import("axios")).default;
      await axios.delete(`${apiUrl}/api/v1/upload/${id}`, {
        headers: settings.deviceToken
          ? { Authorization: `Bearer ${settings.deviceToken}` }
          : {},
      });

      const index = recentUploads.findIndex((u) => u.id === id);
      if (index !== -1) recentUploads.splice(index, 1);

      return { success: true };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Delete failed";
      return { success: false, error: message };
    }
  });

  ipcMain.handle("uploads:file", async (_event, filepath: string) => {
    const settings = getSettings();
    return uploadFile(filepath, settings.deviceToken, settings.uploadEndpoint, {
      burnAfterRead: settings.defaultBurnAfterRead,
      ocr: settings.ocrEnabled,
    });
  });

  ipcMain.handle("uploads:clipboard", async () => {
    const clipboardBuf = getClipboardImage();
    if (!clipboardBuf) {
      throw new Error("No image in clipboard");
    }

    const settings = getSettings();
    return uploadClipboardImage(
      clipboardBuf,
      settings.deviceToken,
      settings.uploadEndpoint,
      {
        burnAfterRead: settings.defaultBurnAfterRead,
        ocr: settings.ocrEnabled,
      }
    );
  });
}
