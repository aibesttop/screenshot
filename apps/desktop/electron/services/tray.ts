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
    // Use a simple 16x16 icon — in production, use platform-specific icons
    const iconPath = this.getIconPath();
    const icon = nativeImage.createEmpty();
    this.tray = new Tray(icon);

    this.tray.setToolTip("SnapLink — Screenshot to URL");
    this.updateMenu();

    this.tray.on("click", () => {
      this.options.onToggleHistory();
    });
  }

  private getIconPath(): string {
    // In development, use a placeholder path
    // In production, these would be platform-specific icons
    const isDev = !app.isPackaged;
    if (isDev) {
      return path.join(__dirname, "../../public/icons/tray-icon.png");
    }
    return path.join(process.resourcesPath, "icons/tray-icon.png");
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
