import { clipboard, nativeImage } from "electron";

export type CopyFormat = "url" | "markdown" | "html";

export function copyUrlToClipboard(url: string, format: CopyFormat = "url") {
  switch (format) {
    case "markdown": {
      const markdown = `![screenshot](${url})`;
      clipboard.write({
        text: markdown,
        html: `<a href="${url}">${url}</a>`,
      });
      break;
    }
    case "html": {
      const html = `<img src="${url}" />`;
      clipboard.write({
        text: url,
        html,
      });
      break;
    }
    case "url":
    default: {
      clipboard.write({
        text: url,
        html: `<a href="${url}">${url}</a>`,
      });
      break;
    }
  }
}

export function getClipboardImage(): Buffer | null {
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;
  return image.toPNG();
}

export function hasClipboardImage(): boolean {
  const image = clipboard.readImage();
  return !image.isEmpty();
}
