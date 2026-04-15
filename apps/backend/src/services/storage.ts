import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const STORAGE_DIR =
  process.env.LOCAL_STORAGE_DIR ?? path.join(process.cwd(), "uploads");

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

const USE_R2 = Boolean(
  R2_ACCOUNT_ID &&
    R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_BUCKET_NAME
);

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Client;
}

export function getStorageBackend(): "r2" | "local" {
  return USE_R2 ? "r2" : "local";
}

export async function ensureStorageDir(): Promise<void> {
  if (USE_R2) return;
  await fs.promises.mkdir(STORAGE_DIR, { recursive: true });
}

export async function storeFile(
  buffer: Buffer,
  shortId: string,
  ext: string
): Promise<{ storageKey: string; sha256: string }> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const storageKey = `${year}/${month}/${shortId}.${ext}`;
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  if (USE_R2) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME!,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeFromExt(ext),
        ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64"),
      })
    );
  } else {
    await ensureStorageDir();
    const dir = path.join(STORAGE_DIR, String(year), month);
    await fs.promises.mkdir(dir, { recursive: true });
    const filepath = path.join(STORAGE_DIR, storageKey);
    await fs.promises.writeFile(filepath, buffer);
  }

  return { storageKey, sha256 };
}

export async function getFile(storageKey: string): Promise<Buffer> {
  if (USE_R2) {
    const res = await getS3Client().send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME!,
        Key: storageKey,
      })
    );
    if (!res.Body) {
      throw new Error(`Empty body for key ${storageKey}`);
    }
    return Buffer.from(await res.Body.transformToByteArray());
  }
  const filepath = path.join(STORAGE_DIR, storageKey);
  return fs.promises.readFile(filepath);
}

export async function deleteFile(storageKey: string): Promise<void> {
  if (USE_R2) {
    try {
      await getS3Client().send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME!,
          Key: storageKey,
        })
      );
    } catch {
      // Object may already be deleted
    }
    return;
  }
  const filepath = path.join(STORAGE_DIR, storageKey);
  try {
    await fs.promises.unlink(filepath);
  } catch {
    // File may already be deleted
  }
}

export function getFilePath(storageKey: string): string {
  // Only meaningful for local storage. With R2 callers should use getFile().
  return path.join(STORAGE_DIR, storageKey);
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}
