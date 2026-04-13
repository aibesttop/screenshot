import { ipcMain } from "electron";
import { getSettings, updateSettings } from "../services/store";
import type { Settings } from "@snaplink/shared-types";

export function registerSettingsIPC() {
  ipcMain.handle("settings:get", () => {
    return getSettings();
  });

  ipcMain.handle("settings:update", (_event, patch: Partial<Settings>) => {
    return updateSettings(patch);
  });
}
