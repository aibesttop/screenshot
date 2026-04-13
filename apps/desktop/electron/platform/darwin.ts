import { execSync } from "child_process";
import path from "path";
import os from "os";

export function getMacScreenshotLocation(): string {
  try {
    return execSync("defaults read com.apple.screencapture location", {
      encoding: "utf8",
    }).trim();
  } catch {
    return path.join(os.homedir(), "Desktop");
  }
}

export function triggerMacScreenshot(): void {
  // Trigger macOS native area screenshot
  // This is done via AppleScript calling the keyboard shortcut
  try {
    execSync(
      `osascript -e 'tell application "System Events" to keystroke "4" using {shift down, command down}'`
    );
  } catch {
    console.error("[darwin] Failed to trigger screenshot");
  }
}
