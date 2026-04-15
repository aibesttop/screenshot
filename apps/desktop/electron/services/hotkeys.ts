import { globalShortcut } from "electron";
import { getSettings } from "./store";

interface HotkeyHandlers {
  onSmartPaste: () => void;
  onUploadClipboard: () => void;
  onToggleHistory: () => void;
  onTogglePause: () => void;
}

let registered = false;

export function registerHotkeys(handlers: HotkeyHandlers) {
  if (registered) {
    unregisterHotkeys();
  }

  const settings = getSettings();

  const bindings: Array<{ key: string; handler: () => void }> = [
    {
      key: settings.hotkeys.smartPaste,
      handler: handlers.onSmartPaste,
    },
    {
      key: settings.hotkeys.uploadClipboard,
      handler: handlers.onUploadClipboard,
    },
    {
      key: settings.hotkeys.toggleHistory,
      handler: handlers.onToggleHistory,
    },
    {
      key: settings.hotkeys.togglePause,
      handler: handlers.onTogglePause,
    },
  ];

  for (const binding of bindings) {
    if (!binding.key || typeof binding.key !== "string") {
      // Defensive — settings migration should guarantee this, but skip
      // registration rather than passing undefined to Electron.
      console.warn("[Hotkeys] Skipping empty accelerator");
      continue;
    }
    try {
      const success = globalShortcut.register(binding.key, binding.handler);
      if (success) {
        console.log(`[Hotkeys] Registered: ${binding.key}`);
      } else {
        console.warn(
          `[Hotkeys] Failed to register hotkey: ${binding.key} (in use by another app?)`
        );
      }
    } catch (err) {
      console.error(
        `[Hotkeys] Error registering hotkey ${binding.key}:`,
        err
      );
    }
  }

  registered = true;
}

export function unregisterHotkeys() {
  globalShortcut.unregisterAll();
  registered = false;
}
