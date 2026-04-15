import { BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import fs from "fs";
import os from "os";

// A small compact window that asks the user to choose between pasting
// the screenshot as the raw image vs a short URL. Centered on the
// primary display. Resolves to the user's choice, or "cancel".

export type PasteChoice = "image" | "url" | "cancel";

interface ShowPickerOptions {
  previewPng: Buffer;
  targetAppName: string | null;
  // Hint for which option to highlight by default.
  defaultChoice: "image" | "url";
  // Optional label describing why the default was chosen (e.g. "Terminal
  // doesn't render images"). Shown as subtext under the default button.
  defaultReason?: string;
}

const IPC_CHANNEL_CHOICE = "snaplink:picker:choice";

let pendingResolver: ((value: PasteChoice) => void) | null = null;
let activeWindow: BrowserWindow | null = null;
let ipcReady = false;

function ensureIpc() {
  if (ipcReady) return;
  ipcMain.on(IPC_CHANNEL_CHOICE, (_event, choice: PasteChoice) => {
    finishWith(choice);
  });
  ipcReady = true;
}

function finishWith(choice: PasteChoice) {
  const resolver = pendingResolver;
  pendingResolver = null;
  if (activeWindow && !activeWindow.isDestroyed()) {
    activeWindow.close();
  }
  activeWindow = null;
  if (resolver) resolver(choice);
}

function buildHtml(opts: {
  previewUrl: string;
  previewW: number;
  previewH: number;
  targetLabel: string;
  defaultChoice: "image" | "url";
  defaultReason: string;
}): string {
  const { previewUrl, previewW, previewH, targetLabel, defaultChoice, defaultReason } = opts;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%; overflow: hidden; user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #e8eaf2;
    background: #0f1220;
  }
  body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .target {
    font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;
    color: #8a93ab;
  }
  .target b { color: #e8eaf2; text-transform: none; letter-spacing: 0; font-weight: 600; }
  .preview {
    width: 100%; height: 150px;
    background: #1a1d2e url("${previewUrl}") center/contain no-repeat;
    border: 1px solid #252a40; border-radius: 8px;
    position: relative;
  }
  .preview::after {
    content: "${previewW} × ${previewH}";
    position: absolute; right: 8px; bottom: 6px;
    font: 500 11px ui-monospace, Menlo, Consolas, monospace;
    color: #c4c9db; background: rgba(10,12,20,0.75);
    padding: 2px 6px; border-radius: 4px;
  }
  .row { display: flex; gap: 10px; }
  button {
    flex: 1; appearance: none; border: 1px solid #252a40;
    background: #1a1d2e; color: #e8eaf2;
    padding: 14px 12px; border-radius: 10px; cursor: pointer;
    font: 600 14px inherit; text-align: left;
    display: flex; flex-direction: column; gap: 4px;
    transition: border-color 0.08s ease, background 0.08s ease;
  }
  button:hover { border-color: #5b8cff; background: #1e2238; }
  button.primary { border-color: #5b8cff; background: #1e2644; }
  button .sub {
    font: 500 11px inherit; color: #8a93ab;
  }
  button .hint {
    font: 500 10px ui-monospace, Menlo, Consolas, monospace;
    color: #5b8cff; letter-spacing: 0.04em;
  }
  .footer {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 11px; color: #5a6079;
  }
  .footer a {
    color: #8a93ab; text-decoration: none; cursor: pointer;
  }
  .footer a:hover { color: #e8eaf2; }
</style>
</head>
<body>
  <div class="target">Paste into <b>${targetLabel}</b></div>
  <div class="preview"></div>
  <div class="row">
    <button id="btn-image" class="${defaultChoice === "image" ? "primary" : ""}" data-choice="image">
      Paste image
      <span class="sub">Original PNG on clipboard${defaultChoice === "image" && defaultReason ? " — " + defaultReason : ""}</span>
      <span class="hint">1 · ENTER</span>
    </button>
    <button id="btn-url" class="${defaultChoice === "url" ? "primary" : ""}" data-choice="url">
      Paste URL
      <span class="sub">Upload and copy short link${defaultChoice === "url" && defaultReason ? " — " + defaultReason : ""}</span>
      <span class="hint">2</span>
    </button>
  </div>
  <div class="footer">
    <span>Esc to cancel</span>
    <a id="cancel">Discard</a>
  </div>
<script>
  const { ipcRenderer } = require('electron');
  function choose(c) { ipcRenderer.send('${IPC_CHANNEL_CHOICE}', c); }
  document.querySelectorAll('button[data-choice]').forEach((b) => {
    b.addEventListener('click', () => choose(b.dataset.choice));
  });
  document.getElementById('cancel').addEventListener('click', () => choose('cancel'));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') choose('cancel');
    else if (e.key === '1') choose('image');
    else if (e.key === '2') choose('url');
    else if (e.key === 'Enter') choose('${defaultChoice}');
  });
</script>
</body>
</html>`;
}

export async function showPastePicker(
  opts: ShowPickerOptions
): Promise<PasteChoice> {
  ensureIpc();

  if (activeWindow) {
    activeWindow.focus();
    return "cancel";
  }

  // Persist preview + HTML to temp files — keeps us off the data-URL
  // size cliff on Windows and lets the HTML reference the image as a
  // normal file:// URL.
  const previewFile = path.join(
    os.tmpdir(),
    `snaplink-preview-${Date.now()}.png`
  );
  await fs.promises.writeFile(previewFile, opts.previewPng);

  // Read dimensions via a lightweight PNG header parse (avoids sharp
  // dep on this hot path).
  const { width: previewW, height: previewH } = readPngDims(opts.previewPng);

  const defaultReason =
    opts.defaultReason ??
    (opts.defaultChoice === "url" && opts.targetAppName
      ? `${opts.targetAppName} is text-only`
      : "");

  const html = buildHtml({
    previewUrl: `file://${previewFile.replace(/\\/g, "/")}`,
    previewW,
    previewH,
    targetLabel: opts.targetAppName ?? "current window",
    defaultChoice: opts.defaultChoice,
    defaultReason,
  });

  const htmlFile = path.join(os.tmpdir(), `snaplink-picker-${Date.now()}.html`);
  await fs.promises.writeFile(htmlFile, html, "utf8");

  const primary = screen.getPrimaryDisplay();
  const width = 420;
  const height = 300;
  const x = primary.bounds.x + Math.round((primary.bounds.width - width) / 2);
  const y = primary.bounds.y + Math.round((primary.bounds.height - height) / 2);

  return new Promise<PasteChoice>((resolve) => {
    pendingResolver = (value) => {
      fs.promises.unlink(previewFile).catch(() => {});
      fs.promises.unlink(htmlFile).catch(() => {});
      resolve(value);
    };

    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: "#0f1220",
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
      },
    });

    activeWindow = win;
    win.setAlwaysOnTop(true, "screen-saver");

    win.loadFile(htmlFile).catch((err) => {
      console.error("[paste-picker] loadFile failed:", err);
      finishWith("cancel");
    });

    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });

    win.on("blur", () => {
      // Dismiss on focus-loss so the picker doesn't strand the user.
      finishWith("cancel");
    });

    win.on("closed", () => {
      if (activeWindow === win) activeWindow = null;
      if (pendingResolver) {
        const r = pendingResolver;
        pendingResolver = null;
        r("cancel");
      }
    });
  });
}

// Minimal PNG dimensions parser. PNG header is fixed: 8-byte signature,
// 4-byte length, 4-byte "IHDR", 4-byte width, 4-byte height.
function readPngDims(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24) return { width: 0, height: 0 };
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}
