import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

export interface FocusedApp {
  appName: string | null;
  platform: NodeJS.Platform;
  // Best-guess hint for the picker's default choice. "unknown" means we
  // can't tell; UI should still let the user choose freely.
  supportsImagePaste: "yes" | "no" | "unknown";
}

// Apps that are known to accept image paste (rich-text / image-aware targets).
const IMAGE_FRIENDLY = new Set([
  // Messaging / AI clients
  "claude",
  "chatgpt",
  "cursor",
  "slack",
  "discord",
  "telegram",
  "wechat",
  "feishu",
  "lark",
  "dingtalk",
  // Editors with inline image support
  "notion",
  "obsidian",
  "typora",
  "bear",
  "craft",
  "evernote",
  "onenote",
  // Office / mail
  "outlook",
  "word",
  "powerpoint",
  "mail",
  // Design
  "figma",
  "sketch",
  // Browsers — depends on the current page; default to yes
  "chrome",
  "firefox",
  "safari",
  "edge",
  "arc",
  "brave",
]);

// Apps that are text-only (won't render pasted images).
const TEXT_ONLY = new Set([
  "terminal",
  "iterm2",
  "iterm",
  "warp",
  "alacritty",
  "kitty",
  "hyper",
  "wezterm",
  "windowsterminal",
  "cmd",
  "powershell",
  "konsole",
  "gnome-terminal",
  "code", // VS Code text editor surface — image paste only works in specific places
  "sublime_text",
  "vim",
  "nvim",
  "neovim",
  "emacs",
]);

function classify(appName: string | null): FocusedApp["supportsImagePaste"] {
  if (!appName) return "unknown";
  const lower = appName.toLowerCase().replace(/\.(app|exe)$/i, "").trim();
  if (IMAGE_FRIENDLY.has(lower)) return "yes";
  if (TEXT_ONLY.has(lower)) return "no";
  // Partial matches
  for (const k of IMAGE_FRIENDLY) if (lower.includes(k)) return "yes";
  for (const k of TEXT_ONLY) if (lower.includes(k)) return "no";
  return "unknown";
}

async function detectMac(): Promise<FocusedApp> {
  try {
    const { stdout } = await exec(
      "osascript",
      [
        "-e",
        'tell application "System Events" to get name of first process whose frontmost is true',
      ],
      { timeout: 800 }
    );
    const appName = stdout.trim() || null;
    return {
      appName,
      platform: "darwin",
      supportsImagePaste: classify(appName),
    };
  } catch {
    return { appName: null, platform: "darwin", supportsImagePaste: "unknown" };
  }
}

async function detectWin(): Promise<FocusedApp> {
  // PowerShell one-liner that calls GetForegroundWindow +
  // GetWindowThreadProcessId and resolves the process name. Kept inline
  // so we don't ship a separate .ps1 file.
  //
  // NOTE: `$pid` is a read-only automatic variable in PowerShell —
  // assigning to it throws. Use `$procId` instead.
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
$h = [W]::GetForegroundWindow()
$procId = 0
[void][W]::GetWindowThreadProcessId($h, [ref]$procId)
(Get-Process -Id $procId).ProcessName
`;
  try {
    const { stdout } = await exec(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 1500 }
    );
    const appName = stdout.trim() || null;
    return {
      appName,
      platform: "win32",
      supportsImagePaste: classify(appName),
    };
  } catch {
    return { appName: null, platform: "win32", supportsImagePaste: "unknown" };
  }
}

async function detectLinux(): Promise<FocusedApp> {
  // Try xdotool first (most X11 DEs), fall back to wmctrl.
  try {
    const { stdout } = await exec(
      "xdotool",
      ["getactivewindow", "getwindowclassname"],
      { timeout: 800 }
    );
    const appName = stdout.trim() || null;
    return {
      appName,
      platform: "linux",
      supportsImagePaste: classify(appName),
    };
  } catch {
    // xdotool missing / Wayland. Silent best-effort.
    return { appName: null, platform: "linux", supportsImagePaste: "unknown" };
  }
}

export async function detectFocusedApp(): Promise<FocusedApp> {
  switch (process.platform) {
    case "darwin":
      return detectMac();
    case "win32":
      return detectWin();
    case "linux":
      return detectLinux();
    default:
      return {
        appName: null,
        platform: process.platform,
        supportsImagePaste: "unknown",
      };
  }
}
