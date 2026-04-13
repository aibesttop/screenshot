import Store from "electron-store";
import type { Settings } from "@snaplink/shared-types";

const defaults: Settings = {
  enabled: true,
  autoStart: false,
  watchPaths: [],

  copyFormat: "url",
  autoUpload: true,
  uploadNotification: true,

  defaultBurnAfterRead: false,
  defaultExpiresIn: "never",
  stripExifMetadata: true,

  ocrEnabled: true,
  ocrLanguages: ["eng"],

  hotkeys: {
    uploadClipboard: "CmdOrCtrl+Shift+V",
    toggleHistory: "CmdOrCtrl+Shift+H",
    togglePause: "CmdOrCtrl+Shift+P",
  },

  deviceToken: null,
  userEmail: null,
  plan: "free",

  uploadEndpoint: "http://localhost:3456",
  analyticsOptIn: false,
  telemetryOptIn: false,
};

export const settingsStore = new Store<Settings>({
  name: "config",
  defaults,
});

export function getSettings(): Settings {
  return settingsStore.store;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  for (const [key, value] of Object.entries(patch)) {
    settingsStore.set(key as keyof Settings, value);
  }
  return settingsStore.store;
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return settingsStore.get(key);
}
