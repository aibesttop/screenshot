import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import { getDefaultWatchPaths, isScreenshotFilename } from "../platform/detect";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".heic"]);
const MIN_SIZE = 10 * 1024; // 10KB
const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_AGE_MS = 10_000; // 10 seconds
const DEBOUNCE_MS = 300;

// Magic bytes for common image formats
const MAGIC_BYTES: Array<{ mime: string; bytes: number[] }> = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

function hasValidMagicBytes(buffer: Buffer): boolean {
  return MAGIC_BYTES.some((sig) =>
    sig.bytes.every((byte, i) => buffer[i] === byte)
  );
}

export class ScreenshotWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private recentlyProcessed = new Set<string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private watchAllImages = false;

  start(
    watchPaths: string[] | null,
    onDetected: (filepath: string) => void,
    options?: { watchAllImages?: boolean }
  ) {
    this.watchAllImages = options?.watchAllImages ?? false;
    const paths = watchPaths ?? getDefaultWatchPaths();

    // Filter to only existing directories
    const validPaths = paths.filter((p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    });

    if (validPaths.length === 0) {
      console.warn(
        "[ScreenshotWatcher] No valid watch paths found. Watching home Desktop as fallback."
      );
      const fallback = path.join(
        process.env.HOME ?? process.env.USERPROFILE ?? "",
        "Desktop"
      );
      validPaths.push(fallback);
    }

    console.log("[ScreenshotWatcher] Watching:", validPaths);

    this.watcher = chokidar.watch(validPaths, {
      ignoreInitial: true,
      persistent: true,
      depth: 0,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    });

    this.watcher.on("add", (filepath) => {
      // Debounce: some OSes fire multiple events per file
      if (this.debounceTimers.has(filepath)) {
        clearTimeout(this.debounceTimers.get(filepath)!);
      }

      this.debounceTimers.set(
        filepath,
        setTimeout(async () => {
          this.debounceTimers.delete(filepath);

          if (this.recentlyProcessed.has(filepath)) return;
          this.recentlyProcessed.add(filepath);
          setTimeout(() => this.recentlyProcessed.delete(filepath), 5000);

          if (await this.isScreenshot(filepath)) {
            onDetected(filepath);
          }
        }, DEBOUNCE_MS)
      );
    });

    this.watcher.on("error", (error) => {
      console.error("[ScreenshotWatcher] Error:", error);
    });
  }

  private async isScreenshot(filepath: string): Promise<boolean> {
    try {
      const ext = path.extname(filepath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) return false;

      const stat = await fs.promises.stat(filepath);

      // Size check
      if (stat.size < MIN_SIZE || stat.size > MAX_SIZE) return false;

      // Recency check — file must have been created in the last 10 seconds
      const age = Date.now() - stat.birthtimeMs;
      if (age > MAX_AGE_MS) return false;

      // Filename heuristic (unless watching all images)
      if (!this.watchAllImages) {
        const filename = path.basename(filepath);
        if (!isScreenshotFilename(filename)) return false;
      }

      // Magic bytes check
      const fd = await fs.promises.open(filepath, "r");
      const headerBuf = Buffer.alloc(12);
      await fd.read(headerBuf, 0, 12, 0);
      await fd.close();

      if (!hasValidMagicBytes(headerBuf)) return false;

      return true;
    } catch {
      return false;
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.recentlyProcessed.clear();
  }

  isRunning(): boolean {
    return this.watcher !== null;
  }
}
