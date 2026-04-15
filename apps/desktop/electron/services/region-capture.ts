import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  nativeImage,
  screen,
} from "electron";
import path from "path";
import fs from "fs";

// Full-screen transparent overlay that captures the primary display,
// displays it as a dimmed backdrop, and lets the user drag a rectangle
// to crop. Resolves with PNG bytes of the selected region, or null if
// the user cancels (Esc / right-click).

let activeWindow: BrowserWindow | null = null;
let pendingResolver: ((value: Buffer | null) => void) | null = null;

const IPC_CHANNEL_SELECT = "snaplink:region:select";
const IPC_CHANNEL_CANCEL = "snaplink:region:cancel";

// Register IPC listeners exactly once for the lifetime of the main
// process. Subsequent captures reuse them.
let ipcReady = false;
function ensureIpc() {
  if (ipcReady) return;
  ipcMain.on(
    IPC_CHANNEL_SELECT,
    (
      _event,
      rect: { x: number; y: number; width: number; height: number }
    ) => {
      void completeCapture(rect);
    }
  );
  ipcMain.on(IPC_CHANNEL_CANCEL, () => {
    finishWith(null);
  });
  ipcReady = true;
}

let capturedBuffer: Buffer | null = null;
let capturedDims: { width: number; height: number; scale: number } | null = null;

async function completeCapture(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<void> {
  if (!capturedBuffer || !capturedDims) {
    finishWith(null);
    return;
  }
  try {
    // The overlay reports rect in CSS (logical) pixels; the captured
    // buffer is in physical pixels. Scale before cropping so HiDPI
    // displays don't end up with a downsampled or misaligned region.
    const s = capturedDims.scale;
    const x = Math.max(0, Math.round(rect.x * s));
    const y = Math.max(0, Math.round(rect.y * s));
    const width = Math.max(
      1,
      Math.min(Math.round(rect.width * s), capturedDims.width - x)
    );
    const height = Math.max(
      1,
      Math.min(Math.round(rect.height * s), capturedDims.height - y)
    );

    const img = nativeImage.createFromBuffer(capturedBuffer);
    const cropped = img.crop({ x, y, width, height });
    finishWith(cropped.toPNG());
  } catch (err) {
    console.error("[region-capture] crop failed:", err);
    finishWith(null);
  }
}

function finishWith(result: Buffer | null) {
  capturedBuffer = null;
  capturedDims = null;
  const resolver = pendingResolver;
  pendingResolver = null;
  if (activeWindow && !activeWindow.isDestroyed()) {
    activeWindow.close();
  }
  activeWindow = null;
  if (resolver) resolver(result);
}

function buildOverlayHtml(pngDataUrl: string, width: number, height: number): string {
  // Inline HTML / CSS / JS for the overlay. Uses nodeIntegration so the
  // tiny script can reach ipcRenderer directly — safe because we
  // generate the HTML ourselves and never load remote content.
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; cursor: crosshair; user-select: none; background: transparent; }
  #screen {
    position: absolute; top: 0; left: 0;
    width: ${width}px; height: ${height}px;
    pointer-events: none;
  }
  #dim {
    position: absolute; inset: 0;
    background: rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
  #sel {
    position: absolute;
    border: 2px solid #5b8cff;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.35);
    display: none;
    pointer-events: none;
  }
  #hint {
    position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
    color: #fff; font: 500 13px -apple-system, system-ui, sans-serif;
    background: rgba(0,0,0,0.6); padding: 8px 14px; border-radius: 8px;
    pointer-events: none;
  }
  #size {
    position: absolute; display: none;
    color: #fff; font: 500 12px ui-monospace, Menlo, Consolas, monospace;
    background: rgba(0,0,0,0.75); padding: 3px 7px; border-radius: 4px;
    pointer-events: none;
  }
</style>
</head>
<body>
  <img id="screen" src="${pngDataUrl}" draggable="false" />
  <div id="dim"></div>
  <div id="sel"></div>
  <div id="size"></div>
  <div id="hint">Drag to select  ·  Esc to cancel  ·  Enter to use full screen</div>
<script>
  const { ipcRenderer } = require('electron');
  const sel = document.getElementById('sel');
  const dim = document.getElementById('dim');
  const sizeLabel = document.getElementById('size');
  const hint = document.getElementById('hint');
  let startX = 0, startY = 0, dragging = false;

  function setRect(x, y, w, h) {
    sel.style.left = x + 'px';
    sel.style.top = y + 'px';
    sel.style.width = w + 'px';
    sel.style.height = h + 'px';
    sel.style.display = 'block';
    sizeLabel.textContent = Math.round(w) + ' × ' + Math.round(h);
    sizeLabel.style.display = 'block';
    sizeLabel.style.left = (x + 4) + 'px';
    sizeLabel.style.top = Math.max(0, y - 22) + 'px';
  }

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) { ipcRenderer.send('${IPC_CHANNEL_CANCEL}'); return; }
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    setRect(startX, startY, 0, 0);
    hint.style.display = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    setRect(x, y, w, h);
  });

  window.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    if (w < 4 || h < 4) {
      // Click without a meaningful drag — treat as cancel
      ipcRenderer.send('${IPC_CHANNEL_CANCEL}');
      return;
    }
    // CSS pixels == screen pixels here because the window was created
    // with exact bounds matching the primary display work area.
    ipcRenderer.send('${IPC_CHANNEL_SELECT}', { x, y, width: w, height: h });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ipcRenderer.send('${IPC_CHANNEL_CANCEL}');
    if (e.key === 'Enter') {
      ipcRenderer.send('${IPC_CHANNEL_SELECT}', { x: 0, y: 0, width: ${width}, height: ${height} });
    }
  });
</script>
</body>
</html>`;
}

export function isCaptureInProgress(): boolean {
  return activeWindow !== null;
}

export async function captureRegion(): Promise<Buffer | null> {
  ensureIpc();

  // Short-circuit if a capture is already in flight — double-trigger
  // guard for when the user hits the hotkey twice.
  if (activeWindow) {
    activeWindow.focus();
    return null;
  }

  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  const scaleFactor = primary.scaleFactor || 1;

  // Grab a full-resolution screenshot of the primary display. The
  // thumbnailSize must be in *physical* pixels to avoid blurring on HiDPI.
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.round(width * scaleFactor),
      height: Math.round(height * scaleFactor),
    },
  });
  const source =
    sources.find((s) => s.display_id === String(primary.id)) ?? sources[0];
  if (!source) {
    throw new Error("No screen source available for capture");
  }

  const pngBuffer = source.thumbnail.toPNG();
  capturedBuffer = pngBuffer;
  capturedDims = {
    width: Math.round(width * scaleFactor),
    height: Math.round(height * scaleFactor),
    scale: scaleFactor,
  };

  // Persist the captured frame to a temp file so the overlay can show
  // it as the backdrop. Data URLs for 4K screenshots routinely bust the
  // window-creation URL length limits on Windows.
  const os = await import("os");
  const tmpFile = path.join(os.tmpdir(), `snaplink-capture-${Date.now()}.png`);
  await fs.promises.writeFile(tmpFile, pngBuffer);

  // The overlay's <img> needs a URL it can load, and its JS still needs
  // to send x/y/width in *logical* pixels for crop math to match. Use
  // the logical size for rendering and rely on the browser to scale.
  const fileUrl = `file://${tmpFile.replace(/\\/g, "/")}`;

  const html = buildOverlayHtml(fileUrl, width, height);

  const htmlFile = path.join(
    os.tmpdir(),
    `snaplink-region-${Date.now()}.html`
  );
  await fs.promises.writeFile(htmlFile, html, "utf8");

  return new Promise<Buffer | null>((resolve) => {
    pendingResolver = (value) => {
      // Clean up temp files after the promise resolves.
      fs.promises.unlink(tmpFile).catch(() => {});
      fs.promises.unlink(htmlFile).catch(() => {});
      resolve(value);
    };

    const win = new BrowserWindow({
      x: primary.bounds.x,
      y: primary.bounds.y,
      width,
      height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        // Internal UI: we generate the HTML ourselves, so nodeIntegration
        // is safe and lets the tiny inline script reach ipcRenderer
        // without a dedicated preload file.
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
      },
    });

    activeWindow = win;

    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(false);

    win.loadFile(htmlFile).catch((err) => {
      console.error("[region-capture] loadFile failed:", err);
      finishWith(null);
    });

    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });

    win.on("closed", () => {
      if (activeWindow === win) activeWindow = null;
      // If closed without a resolution (e.g. user closed the overlay
      // via OS shortcut), fall through to resolve(null).
      if (pendingResolver) {
        const r = pendingResolver;
        pendingResolver = null;
        capturedBuffer = null;
        capturedDims = null;
        r(null);
      } else {
        capturedBuffer = null;
        capturedDims = null;
      }
    });

    // Safety: if the user somehow dismisses without triggering our
    // handlers, escape hatch after 2 minutes.
    setTimeout(() => {
      if (activeWindow === win) finishWith(null);
    }, 120_000);
  });
}
