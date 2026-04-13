import { execSync } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";

export function getWindowsScreenshotPaths(): string[] {
  const home = os.homedir();
  const candidates = [
    path.join(home, "Pictures", "Screenshots"),
    path.join(home, "OneDrive", "Pictures", "Screenshots"),
  ];
  return candidates.filter((p) => fs.existsSync(p));
}

export function triggerWindowsScreenshot(): void {
  try {
    // Launch Snipping Tool in area select mode
    execSync('start "" "SnippingTool.exe" /clip', { shell: "cmd.exe" });
  } catch {
    try {
      // Fallback: newer Win11 Snipping Tool
      execSync('start "" "ms-screenclip:"', { shell: "cmd.exe" });
    } catch {
      console.error("[win32] Failed to trigger screenshot tool");
    }
  }
}
