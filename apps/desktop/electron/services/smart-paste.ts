import { clipboard, nativeImage, BrowserWindow } from "electron";
import { captureRegion, isCaptureInProgress } from "./region-capture";
import { showPastePicker } from "./paste-picker";
import { detectFocusedApp, FocusedApp } from "../platform/focused-app";
import { uploadClipboardImage } from "./uploader";
import { showPasteReady, showUploadError } from "./notifications";
import type { CopyFormat } from "./clipboard";
import type { Settings } from "@snaplink/shared-types";

export interface SmartPasteContext {
  getSettings: () => Settings;
  mainWindow: BrowserWindow | null;
  onTrayState?: (state: "idle" | "uploading" | "error") => void;
  onRecentUpload?: (upload: { id: string; url: string }) => void;
}

// The hotkey-invoked flow: capture a region, ask the user how to paste,
// stage clipboard contents, notify. The user then triggers the actual
// paste themselves (Ctrl+V / ⌘V) in the target app. We deliberately do
// NOT synthesize the paste keystroke — that would require a native
// dependency and the extra manual step is a reasonable trade-off.
export async function runSmartPaste(ctx: SmartPasteContext): Promise<void> {
  if (isCaptureInProgress()) return;

  // Detect the foreground app *before* the overlay steals focus.
  let target: FocusedApp;
  try {
    target = await detectFocusedApp();
  } catch {
    target = {
      appName: null,
      platform: process.platform,
      supportsImagePaste: "unknown",
    };
  }

  // 1. Capture the screen region
  let png: Buffer | null;
  try {
    png = await captureRegion();
  } catch (err) {
    console.error("[smart-paste] capture failed:", err);
    showUploadError(
      err instanceof Error ? err.message : "Screen capture failed"
    );
    return;
  }
  if (!png) return; // user cancelled

  // 2. Ask the user: image or URL
  const defaultChoice: "image" | "url" =
    target.supportsImagePaste === "no" ? "url" : "image";
  const defaultReason =
    target.supportsImagePaste === "no"
      ? `${target.appName ?? "target"} is text-only`
      : undefined;

  const choice = await showPastePicker({
    previewPng: png,
    targetAppName: target.appName,
    defaultChoice,
    defaultReason,
  });
  if (choice === "cancel") return;

  // 3. Execute the chosen format
  if (choice === "image") {
    try {
      clipboard.writeImage(nativeImage.createFromBuffer(png));
      showPasteReady("image", `${png.length.toLocaleString()} bytes`);
    } catch (err) {
      console.error("[smart-paste] clipboard write (image) failed:", err);
      showUploadError("Failed to write image to clipboard");
    }
    return;
  }

  // choice === "url" → upload and put short URL on clipboard
  const settings = ctx.getSettings();
  ctx.onTrayState?.("uploading");
  ctx.mainWindow?.webContents.send("upload:start", { filepath: null });

  try {
    const result = await uploadClipboardImage(
      png,
      settings.deviceToken,
      settings.uploadEndpoint,
      {
        burnAfterRead: settings.defaultBurnAfterRead,
        ocr: settings.ocrEnabled,
      }
    );

    const format: CopyFormat = (settings.copyFormat as CopyFormat) ?? "url";
    writeUrlToClipboard(result.url, format);

    ctx.onRecentUpload?.({ id: result.id, url: result.url });
    ctx.mainWindow?.webContents.send("upload:complete", {
      id: result.id,
      url: result.url,
    });

    showPasteReady("url", result.url);
    ctx.onTrayState?.("idle");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    console.error("[smart-paste] upload failed:", msg);
    showUploadError(msg);
    ctx.mainWindow?.webContents.send("upload:error", {
      code: "UPLOAD_FAILED",
      message: msg,
    });
    ctx.onTrayState?.("error");
    setTimeout(() => ctx.onTrayState?.("idle"), 5000);
  }
}

// Mirrors copyUrlToClipboard but routed here so smart-paste stays
// self-contained and doesn't depend on the normal clipboard service's
// CopyFormat-specific behavior drifting out of sync.
function writeUrlToClipboard(url: string, format: CopyFormat) {
  switch (format) {
    case "markdown":
      clipboard.write({
        text: `![screenshot](${url})`,
        html: `<a href="${url}">${url}</a>`,
      });
      break;
    case "html":
      clipboard.write({ text: url, html: `<img src="${url}" />` });
      break;
    case "url":
    default:
      clipboard.write({ text: url, html: `<a href="${url}">${url}</a>` });
  }
}
