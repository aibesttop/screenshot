import fs from "fs";
import path from "path";
import crypto from "crypto";

const STORAGE_DIR =
  process.env.LOCAL_STORAGE_DIR ?? path.join(process.cwd(), "uploads");

// For v1 development, use local filesystem storage.
// In production, swap this for Cloudflare R2 (S3-compatible).

export async function ensureStorageDir(): Promise<void> {
  await fs.promises.mkdir(STORAGE_DIR, { recursive: true });
}

export async function storeFile(
  buffer: Buffer,
  shortId: string,
  ext: string
): Promise<{ storageKey: string; sha256: string }> {
  await ensureStorageDir();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_DIR, String(year), month);
  await fs.promises.mkdir(dir, { recursive: true });

  const storageKey = `${year}/${month}/${shortId}.${ext}`;
  const filepath = path.join(STORAGE_DIR, storageKey);

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  await fs.promises.writeFile(filepath, buffer);

  return { storageKey, sha256 };
}

export async function getFile(storageKey: string): Promise<Buffer> {
  const filepath = path.join(STORAGE_DIR, storageKey);
  return fs.promises.readFile(filepath);
}

export async function deleteFile(storageKey: string): Promise<void> {
  const filepath = path.join(STORAGE_DIR, storageKey);
  try {
    await fs.promises.unlink(filepath);
  } catch {
    // File may already be deleted
  }
}

export function getFilePath(storageKey: string): string {
  return path.join(STORAGE_DIR, storageKey);
}
