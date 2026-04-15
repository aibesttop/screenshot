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
    try {
      const success = globalShortcut.register(binding.key, binding.handler);
      if (!success) {
        console.warn(
          `[Hotkeys] Failed to register hotkey: ${binding.key}`
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
