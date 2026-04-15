import { Notification, shell } from "electron";

export function showUploadSuccess(url: string) {
  const notification = new Notification({
    title: "SnapLink",
    body: `URL copied: ${url}`,
    silent: false,
  });

  notification.on("click", () => {
    shell.openExternal(url);
  });

  notification.show();
}

export function showUploadError(message: string) {
  const notification = new Notification({
    title: "SnapLink — Upload Failed",
    body: message,
    silent: false,
  });

  notification.show();
}

export function showOcrComplete(url: string) {
  const notification = new Notification({
    title: "SnapLink",
    body: `OCR ready for ${url}`,
    silent: true,
  });

  notification.on("click", () => {
    shell.openExternal(url);
  });

  notification.show();
}

export function showPasteReady(format: "image" | "url", detail: string) {
  const notification = new Notification({
    title:
      format === "image"
        ? "SnapLink — image ready"
        : "SnapLink — URL ready",
    body: `${detail}  ·  Press Ctrl+V (⌘V) to paste`,
    silent: true,
  });
  notification.show();
}

export function showUpdateAvailable(version: string) {
  const notification = new Notification({
    title: "SnapLink Update Available",
    body: `SnapLink ${version} is available. Click to update.`,
    silent: true,
  });

  notification.show();
  return notification;
}
