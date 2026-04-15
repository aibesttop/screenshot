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
    // Ctrl/Cmd+Shift+V: capture region → picker (image vs URL).
    // This is the flagship flow. Moved the old "upload clipboard" hotkey
    // to Alt+Shift+V so both behaviors remain accessible.
    smartPaste: "CmdOrCtrl+Shift+V",
    uploadClipboard: "Alt+Shift+V",
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

// electron-store's `defaults` only merges for missing TOP-level keys. When
// we add new nested keys (e.g. hotkeys.smartPaste) in a release, existing
// users' persisted `hotkeys` object is already present, so the new
// sub-key stays undefined. Fill in missing nested keys on every boot so
// upgrades don't lose new hotkeys.
function migrateSettings() {
  const current = settingsStore.store;
  const mergedHotkeys = { ...defaults.hotkeys, ...(current.hotkeys ?? {}) };

  // If an old install still has uploadClipboard bound to what is now
  // the smartPaste accelerator, remap it to the new default so both
  // behaviors remain accessible and don't collide.
  if (
    mergedHotkeys.uploadClipboard === defaults.hotkeys.smartPaste &&
    mergedHotkeys.smartPaste === defaults.hotkeys.smartPaste
  ) {
    mergedHotkeys.uploadClipboard = defaults.hotkeys.uploadClipboard;
  }

  // Guarantee every required sub-key exists so register() never sees
  // undefined.
  for (const k of Object.keys(defaults.hotkeys) as Array<
    keyof typeof defaults.hotkeys
  >) {
    if (!mergedHotkeys[k]) mergedHotkeys[k] = defaults.hotkeys[k];
  }

  settingsStore.set("hotkeys", mergedHotkeys);
}
migrateSettings();

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
