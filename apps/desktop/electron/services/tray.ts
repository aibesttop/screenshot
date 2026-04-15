import {
  Tray,
  Menu,
  nativeImage,
  BrowserWindow,
  app,
  shell,
} from "electron";
import path from "path";
import { getSettings, updateSettings } from "./store";

export type TrayState = "idle" | "uploading" | "error" | "offline";

interface TrayOptions {
  onSmartPaste: () => void;
  onUploadClipboard: () => void;
  onToggleHistory: () => void;
  onOpenSettings: () => void;
  onTogglePause: () => void;
  onQuit: () => void;
  getRecentUrls: () => Array<{ id: string; url: string }>;
}

export class AppTray {
  private tray: Tray | null = null;
  private options: TrayOptions;
  private state: TrayState = "idle";
  private isPaused = false;

  constructor(options: TrayOptions) {
    this.options = options;
  }

  create() {
    const icon = this.loadIcon();
    this.tray = new Tray(icon);

    this.tray.setToolTip("SnapLink — Screenshot to URL");
    this.updateMenu();

    this.tray.on("click", () => {
      this.options.onToggleHistory();
    });
  }

  private loadIcon(): Electron.NativeImage {
    // Try the runtime icon path first. `createEmpty()` on Windows
    // produces an invisible-but-clickable tray entry — users can't
    // find it. A real bitmap keeps the tray discoverable.
    const candidates = this.getIconCandidates();
    for (const p of candidates) {
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) return img;
      } catch {
        // fall through to next candidate
      }
    }
    // Last resort — invisible on Windows but won't crash. macOS handles
    // empty images gracefully by showing `setTitle` text instead.
    return nativeImage.createEmpty();
  }

  private getIconCandidates(): string[] {
    if (app.isPackaged) {
      // electron-builder ships `build/` contents via `extraResources`
      // at `process.resourcesPath`.
      return [
        path.join(process.resourcesPath, "build", "tray-icon.png"),
        path.join(process.resourcesPath, "tray-icon.png"),
      ];
    }
    return [
      path.join(__dirname, "../../build/tray-icon.png"),
      path.join(__dirname, "../../public/icons/tray-icon.png"),
    ];
  }

  updateMenu() {
    if (!this.tray) return;

    const settings = getSettings();
    const recentUrls = this.options.getRecentUrls();
    this.isPaused = !settings.enabled;

    const statusLabel = this.getStatusLabel();

    const recentSubmenu =
      recentUrls.length > 0
        ? recentUrls.map((item) => ({
            label: item.url,
            click: () => {
              const { clipboard } = require("electron");
              clipboard.writeText(item.url);
            },
          }))
        : [{ label: "No recent uploads", enabled: false }];

    const contextMenu = Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { type: "separator" as const },
      {
        label: "Capture & paste...",
        accelerator: settings.hotkeys.smartPaste,
        click: () => this.options.onSmartPaste(),
      },
      {
        label: "Upload clipboard image",
        accelerator: settings.hotkeys.uploadClipboard,
        click: () => this.options.onUploadClipboard(),
      },
      {
        label: "Recent uploads",
        submenu: recentSubmenu,
      },
      { type: "separator" as const },
      {
        label: "Open dashboard",
        click: () => this.options.onToggleHistory(),
      },
      {
        label: "Settings...",
        click: () => this.options.onOpenSettings(),
      },
      {
        label: "Help & feedback",
        click: () => shell.openExternal("https://snaplink.io/help"),
      },
      { type: "separator" as const },
      {
        label: this.isPaused ? "Resume auto-upload" : "Pause auto-upload",
        click: () => this.options.onTogglePause(),
      },
      { type: "separator" as const },
      {
        label: "Quit SnapLink",
        click: () => this.options.onQuit(),
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  setState(state: TrayState) {
    this.state = state;
    this.updateMenu();
    // In production, also update the icon image based on state
  }

  private getStatusLabel(): string {
    if (this.isPaused) return "⏸ Paused";
    switch (this.state) {
      case "idle":
        return "● Connected";
      case "uploading":
        return "↑ Uploading...";
      case "error":
        return "● Error";
      case "offline":
        return "○ Offline";
      default:
        return "● Connected";
    }
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
