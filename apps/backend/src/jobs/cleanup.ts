import { prisma } from "../lib/prisma";
import { deleteFile } from "../services/storage";

/**
 * Clean up expired uploads and burn-after-read uploads.
 * Run this on a daily cron schedule.
 */
export async function cleanupExpiredUploads(): Promise<{
  expired: number;
  burned: number;
}> {
  const now = new Date();

  // Find expired uploads
  const expiredUploads = await prisma.upload.findMany({
    where: {
      expiresAt: { lte: now },
    },
    select: { id: true, shortId: true, storageKey: true },
  });

  // Find burn-after-read uploads that were viewed more than 60 seconds ago
  const burnedCutoff = new Date(now.getTime() - 60_000);
  const burnedUploads = await prisma.upload.findMany({
    where: {
      burnAfterRead: true,
      firstViewedAt: { lte: burnedCutoff },
    },
    select: { id: true, shortId: true, storageKey: true },
  });

  const allToDelete = [...expiredUploads, ...burnedUploads];

  // Delete files from storage
  for (const upload of allToDelete) {
    try {
      await deleteFile(upload.storageKey);
    } catch (err) {
      console.error(
        `[Cleanup] Failed to delete file for ${upload.shortId}:`,
        err
      );
    }
  }

  // Delete records from database
  const ids = allToDelete.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.upload.deleteMany({
      where: { id: { in: ids } },
    });
  }

  console.log(
    `[Cleanup] Removed ${expiredUploads.length} expired + ${burnedUploads.length} burned uploads`
  );

  return {
    expired: expiredUploads.length,
    burned: burnedUploads.length,
  };
}

/**
 * Start periodic cleanup. Runs every hour.
 */
export function startCleanupSchedule() {
  // Run immediately on startup
  cleanupExpiredUploads().catch((err) =>
    console.error("[Cleanup] Initial run failed:", err)
  );

  // Then every hour
  setInterval(
    () => {
      cleanupExpiredUploads().catch((err) =>
        console.error("[Cleanup] Scheduled run failed:", err)
      );
    },
    60 * 60 * 1000
  );
}
