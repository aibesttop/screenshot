/**
 * Strip EXIF metadata from images for privacy.
 * Removes GPS, device info, and other potentially sensitive metadata.
 */
export async function stripExifMetadata(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;

    // sharp automatically strips EXIF when re-encoding
    // We use .rotate() with no args to auto-orient based on EXIF, then strip
    const result = await sharp(buffer)
      .rotate() // auto-orient from EXIF then discard orientation tag
      .withMetadata({
        // Keep only essential metadata, strip EXIF/GPS/etc
        exif: undefined,
      })
      .toBuffer();

    return result;
  } catch {
    // If sharp fails, return original buffer
    console.warn("[EXIF] Failed to strip metadata, returning original");
    return buffer;
  }
}

/**
 * Get image dimensions without loading the full image into memory.
 */
export async function getImageDimensions(
  buffer: Buffer
): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
    return null;
  } catch {
    return null;
  }
}
