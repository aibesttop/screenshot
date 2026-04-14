import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
} from "electron";
import path from "path";
import { ScreenshotWatcher } from "./services/watcher";
import { uploadFile } from "./services/uploader";
import { copyUrlToClipboard, getClipboardImage } from "./services/clipboard";
import {
  showUploadSuccess,
  showUploadError,
} from "./services/notifications";
import { getSettings, updateSettings } from "./services/store";
import { AppTray } from "./services/tray";
import { registerHotkeys, unregisterHotkeys } from "./services/hotkeys";
import { registerUploadIPC, addRecentUpload, getRecentUrls } from "./ipc/upload";
import { registerSettingsIPC } from "./ipc/settings";
import { registerAuthIPC, handleAuthCallback } from "./ipc/auth";
import { registerBillingIPC } from "./ipc/billing";
import { registerFeedbackIPC } from "./ipc/feedback";
import { uploadClipboardImage } from "./services/uploader";
import { CopyFormat } from "./services/clipboard";

// Prevent multiple instances — if this returned false, another copy is
// already running. We forward any deep-link argv to it via the
// `second-instance` event below, then exit without starting the rest of
// the app.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

// Register as the default handler for snaplink:// deep links so the OS
// routes auth callbacks back into the app. Must run early (before
// whenReady) and before the installer's first launch, hence also
// declared in electron-builder.yml `protocols:` for Windows.
if (process.defaultApp) {
  // In dev, argv[1] is the script path — pass it so re-launch works.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("snaplink", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("snaplink");
}

let mainWindow: BrowserWindow | null = null;
let watcher: ScreenshotWatcher | null = null;
let appTray: AppTray | null = null;

const isDev = !app.isPackaged;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Hidden by default — tray is primary interaction
    title: "SnapLink",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist-renderer/index.html"));
  }

  // If the renderer fails to load (wrong path, missing bundle, etc.),
  // auto-open DevTools so the user can see what broke instead of
  // staring at a blank window.
  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[Main] did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`
      );
      if (!win.isDestroyed()) {
        win.show();
        win.webContents.openDevTools({ mode: "detach" });
      }
    }
  );

  // F12 / Ctrl+Shift+I toggles DevTools in both dev and prod — useful
  // for diagnosing packaged-build issues without having to rebuild.
  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    const isDevtoolsShortcut =
      input.key === "F12" ||
      (input.control && input.shift && input.key.toLowerCase() === "i");
    if (isDevtoolsShortcut) {
      win.webContents.toggleDevTools();
    }
  });

  win.on("close", (event) => {
    // Hide instead of close (keep in tray)
    event.preventDefault();
    win.hide();
  });

  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
}

function startWatcher() {
  const settings = getSettings();
  if (!settings.enabled) return;

  watcher = new ScreenshotWatcher();
  const watchPaths =
    settings.watchPaths.length > 0 ? settings.watchPaths : null;

  watcher.start(watchPaths, async (filepath) => {
    if (!settings.autoUpload) return;

    console.log("[Main] Screenshot detected:", filepath);

    // Notify renderer
    mainWindow?.webContents.send("upload:start", { filepath });
    appTray?.setState("uploading");

    try {
      const result = await uploadFile(
        filepath,
        settings.deviceToken,
        settings.uploadEndpoint,
        {
          burnAfterRead: settings.defaultBurnAfterRead,
          ocr: settings.ocrEnabled,
        }
      );

      // Copy URL to clipboard
      copyUrlToClipboard(
        result.url,
        settings.copyFormat as CopyFormat
      );

      // Add to recent uploads
      addRecentUpload({
        id: result.id,
        url: result.url,
        filepath,
      });

      // Notify
      if (settings.uploadNotification) {
        showUploadSuccess(result.url);
      }

      // Notify renderer
      mainWindow?.webContents.send("upload:complete", {
        id: result.id,
        url: result.url,
        filepath,
      });

      appTray?.setState("idle");
      appTray?.updateMenu();

      console.log("[Main] Upload complete:", result.url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed";
      console.error("[Main] Upload error:", message);

      showUploadError(message);
      mainWindow?.webContents.send("upload:error", {
        code: "UPLOAD_FAILED",
        message,
      });

      appTray?.setState("error");
      setTimeout(() => appTray?.setState("idle"), 5000);
    }
  });
}

function stopWatcher() {
  if (watcher) {
    watcher.stop();
    watcher = null;
  }
}

async function handleUploadClipboard() {
  const clipboardBuf = getClipboardImage();
  if (!clipboardBuf) {
    showUploadError("No image in clipboard");
    return;
  }

  const settings = getSettings();
  appTray?.setState("uploading");

  try {
    const result = await uploadClipboardImage(
      clipboardBuf,
      settings.deviceToken,
      settings.uploadEndpoint,
      {
        burnAfterRead: settings.defaultBurnAfterRead,
        ocr: settings.ocrEnabled,
      }
    );

    copyUrlToClipboard(result.url, settings.copyFormat as CopyFormat);
    addRecentUpload({ id: result.id, url: result.url });

    if (settings.uploadNotification) {
      showUploadSuccess(result.url);
    }

    mainWindow?.webContents.send("upload:complete", {
      id: result.id,
      url: result.url,
    });

    appTray?.setState("idle");
    appTray?.updateMenu();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed";
    showUploadError(message);
    appTray?.setState("error");
    setTimeout(() => appTray?.setState("idle"), 5000);
  }
}

function togglePause() {
  const settings = getSettings();
  const newEnabled = !settings.enabled;
  updateSettings({ enabled: newEnabled });

  if (newEnabled) {
    startWatcher();
  } else {
    stopWatcher();
  }

  appTray?.updateMenu();
}

// ===== App lifecycle =====

app.whenReady().then(() => {
  // This is a tray-driven utility — suppress the stock File/Edit/View
  // menu bar on Windows/Linux. (On macOS the system menu bar is owned
  // by the OS; setting null removes everything except the app menu.)
  Menu.setApplicationMenu(null);

  // Register IPC handlers
  registerUploadIPC();
  registerSettingsIPC();
  registerAuthIPC();
  registerBillingIPC();
  registerFeedbackIPC();

  // System IPC
  ipcMain.handle("system:openUrl", (_event, url: string) => {
    shell.openExternal(url);
  });
  ipcMain.handle("system:reveal", (_event, filepath: string) => {
    shell.showItemInFolder(filepath);
  });

  // Create main window
  mainWindow = createMainWindow();

  // Create system tray
  appTray = new AppTray({
    onUploadClipboard: handleUploadClipboard,
    onToggleHistory: () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    onOpenSettings: () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("navigate", "/settings");
      }
    },
    onTogglePause: togglePause,
    onQuit: () => {
      stopWatcher();
      unregisterHotkeys();
      appTray?.destroy();
      mainWindow?.destroy();
      mainWindow = null;
      app.quit();
    },
    getRecentUrls,
  });
  appTray.create();

  // Register global hotkeys
  registerHotkeys({
    onUploadClipboard: handleUploadClipboard,
    onToggleHistory: () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    onTogglePause: togglePause,
  });

  // Start file watcher
  startWatcher();

  // Auto-updater (skip in development)
  if (!isDev) {
    import("./services/updater").then(({ initAutoUpdater, startUpdateCheckInterval }) => {
      initAutoUpdater(mainWindow);
      startUpdateCheckInterval();
    });
  }
});

// macOS: handle deep links when app is already running
app.on("open-url", (_event, url) => {
  handleAuthCallback(url);
});

// Handle second instance (Windows/Linux deep link)
app.on("second-instance", (_event, commandLine) => {
  const url = commandLine.find((arg) => arg.startsWith("snaplink://"));
  if (url) {
    handleAuthCallback(url);
  }

  // Surface the existing window — user probably re-launched expecting
  // to see it, so show() in addition to focus() since the window is
  // hidden-by-default in this tray app.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  // On macOS, keep app running in tray even if all windows are closed
  if (process.platform !== "darwin") {
    // On Windows/Linux, also keep running via tray
    // Only quit via tray menu
  }
});

app.on("will-quit", () => {
  unregisterHotkeys();
  stopWatcher();
});

app.on("activate", () => {
  // macOS: re-show window when dock icon clicked
  if (mainWindow) {
    mainWindow.show();
  }
});
