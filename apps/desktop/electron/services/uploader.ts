import FormData from "form-data";
import fs from "fs";
import path from "path";
import axios, { AxiosError } from "axios";
import { app } from "electron";

const DEFAULT_API_URL = "http://localhost:3456";

export interface UploadResult {
  id: string;
  url: string;
  rawUrl: string;
  markdown: string;
  html: string;
  expiresAt: string | null;
  burnAfterRead: boolean;
  ocrStatus: string;
  size: number;
  width: number | null;
  height: number | null;
}

export interface UploadOptions {
  burnAfterRead?: boolean;
  ocr?: boolean;
  expiresIn?: string;
  projectId?: string;
}

export async function uploadFile(
  filepath: string,
  token: string | null,
  apiUrl: string = DEFAULT_API_URL,
  opts: UploadOptions = {}
): Promise<UploadResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(filepath));
      form.append("burn_after_read", String(opts.burnAfterRead ?? false));
      form.append("ocr", String(opts.ocr ?? true));
      if (opts.expiresIn) {
        form.append("expires_in", opts.expiresIn);
      }
      if (opts.projectId) {
        form.append("project_id", opts.projectId);
      }

      const appVersion = (() => {
        try {
          return app.getVersion();
        } catch {
          return "1.0.0";
        }
      })();

      const response = await axios.post(`${apiUrl}/api/v1/upload`, form, {
        headers: {
          ...form.getHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-Client-Version": appVersion,
          "X-Platform": process.platform,
        },
        timeout: 30000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      return response.data;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on client errors (4xx)
      if (error instanceof AxiosError && error.response) {
        const status = error.response.status;
        if (status >= 400 && status < 500) {
          throw error;
        }
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }

  throw lastError;
}

export async function uploadClipboardImage(
  clipboardBuffer: Buffer,
  token: string | null,
  apiUrl: string = DEFAULT_API_URL,
  opts: UploadOptions = {}
): Promise<UploadResult> {
  // Save to temp file, then upload
  const tmpDir = app.getPath("temp");
  const tmpFile = path.join(tmpDir, `snaplink-clipboard-${Date.now()}.png`);
  await fs.promises.writeFile(tmpFile, clipboardBuffer);

  try {
    return await uploadFile(tmpFile, token, apiUrl, opts);
  } finally {
    // Clean up temp file
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}
