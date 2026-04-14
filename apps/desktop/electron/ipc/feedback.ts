import { ipcMain, app } from "electron";
import os from "os";
import { getSettings } from "../services/store";

export interface FeedbackPayload {
  category: "bug" | "feature" | "question" | "other";
  message: string;
  email?: string;
  includeDiagnostics?: boolean;
}

export function registerFeedbackIPC() {
  ipcMain.handle(
    "feedback:submit",
    async (_event, payload: FeedbackPayload) => {
      if (!payload?.message || payload.message.trim().length < 5) {
        return { success: false, error: "Message is too short" };
      }

      const settings = getSettings();
      const diagnostics = payload.includeDiagnostics
        ? {
            appVersion: app.getVersion(),
            platform: process.platform,
            osRelease: os.release(),
            arch: process.arch,
            locale: app.getLocale(),
            plan: settings.plan,
          }
        : undefined;

      try {
        const axios = (await import("axios")).default;
        await axios.post(
          `${settings.uploadEndpoint}/api/v1/feedback`,
          {
            category: payload.category,
            message: payload.message.slice(0, 5000),
            email: payload.email || settings.userEmail || null,
            diagnostics,
          },
          {
            headers: settings.deviceToken
              ? { Authorization: `Bearer ${settings.deviceToken}` }
              : {},
            timeout: 15_000,
          }
        );
        return { success: true };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send feedback";
        return { success: false, error: message };
      }
    }
  );
}
