import path from "path";
import os from "os";
import fs from "fs";
import { execSync } from "child_process";

export function getDefaultWatchPaths(): string[] {
  const home = os.homedir();

  switch (process.platform) {
    case "darwin": {
      const paths = [path.join(home, "Desktop")];

      // Try to read macOS screenshot location from defaults
      try {
        const custom = execSync(
          "defaults read com.apple.screencapture location",
          { encoding: "utf8" }
        ).trim();
        if (custom && custom !== paths[0]) {
          paths.unshift(custom);
        }
      } catch {
        // Default location not set — Desktop is default
      }

      // Also add Pictures/Screenshots if it exists (newer macOS)
      const picsScreenshots = path.join(home, "Pictures", "Screenshots");
      if (fs.existsSync(picsScreenshots)) {
        paths.push(picsScreenshots);
      }

      return paths;
    }

    case "win32": {
      const candidates = [
        path.join(home, "Pictures", "Screenshots"),
        path.join(home, "OneDrive", "Pictures", "Screenshots"),
      ];
      return candidates.filter((p) => fs.existsSync(p));
    }

    case "linux": {
      const candidates = [
        path.join(home, "Pictures", "Screenshots"),
        path.join(home, "Pictures"),
      ];
      return candidates.filter((p) => fs.existsSync(p));
    }

    default:
      return [path.join(home, "Desktop")];
  }
}

export function isScreenshotFilename(filename: string): boolean {
  const patterns = [
    /^Screen Shot \d{4}-\d{2}-\d{2}/i, // macOS (older)
    /^Screenshot \d{4}-\d{2}-\d{2}/i, // macOS (newer)
    /^Screenshot_\d{4}-\d{2}-\d{2}/i, // Windows/Linux
    /^Screenshot from \d{4}-\d{2}-\d{2}/i, // GNOME
    /^Screenshot \(\d+\)/i, // macOS Sequoia+
    /^CleanShot/, // CleanShot X
    /^Shottr/, // Shottr
    /^Snip/i, // Windows Snipping Tool
    /^\d{4}-\d{2}-\d{2}.*screenshot/i, // Flameshot pattern
    /^scrot/i, // scrot tool
    /^spectacle/i, // KDE Spectacle
    /^ksnip/i, // ksnip
    /^Greenshot/i, // Greenshot
    /^ShareX/i, // ShareX
  ];
  return patterns.some((p) => p.test(filename));
}

export function getPlatformName(): string {
  switch (process.platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return process.platform;
  }
}
