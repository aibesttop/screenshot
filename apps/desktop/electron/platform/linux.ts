import { execSync } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";

export function getLinuxScreenshotPaths(): string[] {
  const home = os.homedir();
  const candidates = [
    path.join(home, "Pictures", "Screenshots"),
    path.join(home, "Pictures"),
  ];
  return candidates.filter((p) => fs.existsSync(p));
}

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function getAvailableScreenshotTool():
  | "gnome-screenshot"
  | "spectacle"
  | "flameshot"
  | "scrot"
  | "xfce4-screenshooter"
  | null {
  const tools = [
    "gnome-screenshot",
    "spectacle",
    "flameshot",
    "scrot",
    "xfce4-screenshooter",
  ] as const;

  for (const tool of tools) {
    if (hasCommand(tool)) return tool;
  }
  return null;
}

export function triggerLinuxScreenshot(): void {
  const tool = getAvailableScreenshotTool();

  try {
    switch (tool) {
      case "gnome-screenshot":
        execSync("gnome-screenshot -a");
        break;
      case "spectacle":
        execSync("spectacle -r");
        break;
      case "flameshot":
        execSync("flameshot gui");
        break;
      case "scrot":
        execSync("scrot -s ~/Pictures/Screenshots/scrot_%Y-%m-%d_%H%M%S.png");
        break;
      case "xfce4-screenshooter":
        execSync("xfce4-screenshooter -r");
        break;
      default:
        console.error("[linux] No screenshot tool found");
    }
  } catch {
    console.error("[linux] Failed to trigger screenshot with", tool);
  }
}
