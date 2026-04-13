// Magic bytes for image format detection
const SIGNATURES: Record<string, { bytes: number[]; offset?: number }> = {
  "image/png": { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  "image/jpeg": { bytes: [0xff, 0xd8, 0xff] },
  "image/gif": { bytes: [0x47, 0x49, 0x46] },
  "image/webp": { bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
};

const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
]);

const MIN_SIZE = 10 * 1024; // 10KB
const MAX_SIZE_FREE = 20 * 1024 * 1024; // 20MB
const MAX_SIZE_PRO = 50 * 1024 * 1024; // 50MB

export function detectMimeType(buffer: Buffer): string | null {
  for (const [mime, sig] of Object.entries(SIGNATURES)) {
    const offset = sig.offset ?? 0;
    const match = sig.bytes.every(
      (byte, i) => buffer[offset + i] === byte
    );
    if (match) {
      // Special handling for WebP: must also have WEBP at offset 8
      if (mime === "image/webp") {
        if (
          buffer[8] === 0x57 &&
          buffer[9] === 0x45 &&
          buffer[10] === 0x42 &&
          buffer[11] === 0x50
        ) {
          return mime;
        }
        continue;
      }
      return mime;
    }
  }
  return null;
}

export function validateImage(
  buffer: Buffer,
  claimedMime: string,
  isPro = false
): { valid: true; detectedMime: string } | { valid: false; error: string } {
  if (!ALLOWED_MIMES.has(claimedMime)) {
    return {
      valid: false,
      error: `Unsupported file type: ${claimedMime}. Allowed: ${[...ALLOWED_MIMES].join(", ")}`,
    };
  }

  if (buffer.length < MIN_SIZE) {
    return {
      valid: false,
      error: `File too small: ${buffer.length} bytes. Minimum: ${MIN_SIZE} bytes`,
    };
  }

  const maxSize = isPro ? MAX_SIZE_PRO : MAX_SIZE_FREE;
  if (buffer.length > maxSize) {
    return {
      valid: false,
      error: `File too large: ${buffer.length} bytes. Maximum: ${maxSize} bytes`,
    };
  }

  const detectedMime = detectMimeType(buffer);
  if (!detectedMime) {
    // HEIC detection is complex; trust the claimed type for now
    if (claimedMime === "image/heic") {
      return { valid: true, detectedMime: claimedMime };
    }
    return { valid: false, error: "Could not detect image format from magic bytes" };
  }

  return { valid: true, detectedMime };
}

export function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
  };
  return map[mime] ?? "png";
}
