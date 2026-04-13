import { ipcMain, shell } from "electron";
import { getSettings, updateSettings } from "../services/store";
import crypto from "crypto";

export function registerAuthIPC() {
  ipcMain.handle("auth:login", async () => {
    const sessionId = crypto.randomBytes(16).toString("hex");

    // Open browser to auth page
    const authUrl = `https://snaplink.io/auth/desktop?session=${sessionId}`;
    await shell.openExternal(authUrl);

    return { sessionId };
  });

  ipcMain.handle("auth:logout", () => {
    updateSettings({
      deviceToken: null,
      userEmail: null,
      plan: "free",
    });
    return { success: true };
  });
}

// Handle deep link from auth callback (snaplink://auth/callback?...)
export function handleAuthCallback(url: string) {
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");
    const email = parsed.searchParams.get("email");
    const plan = parsed.searchParams.get("plan") as
      | "free"
      | "pro"
      | "team"
      | null;

    if (token) {
      updateSettings({
        deviceToken: token,
        userEmail: email,
        plan: plan ?? "free",
      });
      return true;
    }
  } catch {
    console.error("[Auth] Failed to parse auth callback URL:", url);
  }
  return false;
}
