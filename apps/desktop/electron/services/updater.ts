import { autoUpdater } from "electron-updater";
import { BrowserWindow } from "electron";
import { showUpdateAvailable } from "./notifications";

let lastCheckTime = 0;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

export function initAutoUpdater(mainWindow: BrowserWindow | null) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log("[Updater] Update available:", info.version);
    showUpdateAvailable(info.version);
    if (mainWindow) {
      mainWindow.webContents.send("update:available", {
        version: info.version,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[Updater] Update downloaded:", info.version);
    if (mainWindow) {
      mainWindow.webContents.send("update:downloaded", {
        version: info.version,
      });
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err);
  });
}

export function checkForUpdates() {
  const now = Date.now();
  if (now - lastCheckTime < CHECK_INTERVAL) return;

  lastCheckTime = now;
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("[Updater] Check failed:", err);
  });
}

export function startUpdateCheckInterval() {
  // Check on startup
  checkForUpdates();

  // Then every 6 hours
  setInterval(checkForUpdates, CHECK_INTERVAL);
}

export function installUpdate() {
  autoUpdater.quitAndInstall(false, true);
}
