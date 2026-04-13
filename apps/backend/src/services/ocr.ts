import { prisma } from "../lib/prisma";
import { getFilePath } from "./storage";

let tesseractWorker: import("tesseract.js").Worker | null = null;

async function getWorker(): Promise<import("tesseract.js").Worker> {
  if (tesseractWorker) return tesseractWorker;

  const Tesseract = await import("tesseract.js");
  tesseractWorker = await Tesseract.createWorker("eng");
  return tesseractWorker;
}

export async function processOCR(
  uploadId: string,
  languages: string[] = ["eng"]
): Promise<void> {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
  });

  if (!upload || upload.ocrStatus !== "PENDING") return;

  try {
    const filepath = getFilePath(upload.storageKey);
    const worker = await getWorker();

    // Reinitialize worker with requested languages if different from current
    if (languages.length > 0 && languages[0] !== "eng") {
      await worker.reinitialize(languages.join("+"));
    }

    // Set a timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("OCR timeout: exceeded 10s")), 10_000)
    );

    const ocrPromise = worker.recognize(filepath);
    const result = await Promise.race([ocrPromise, timeoutPromise]);

    const text = result.data.text.trim();

    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        ocrText: text || null,
        ocrLang: languages.join("+"),
        ocrStatus: "COMPLETED",
      },
    });

    console.log(
      `[OCR] Completed for upload ${upload.shortId}: ${text.length} chars`
    );
  } catch (error) {
    console.error(`[OCR] Failed for upload ${uploadId}:`, error);

    await prisma.upload.update({
      where: { id: uploadId },
      data: { ocrStatus: "FAILED" },
    });
  }
}

// Simple in-process queue for OCR jobs (use BullMQ + Redis in production)
const ocrQueue: Array<{ uploadId: string; languages: string[] }> = [];
let processing = false;

export function enqueueOCR(uploadId: string, languages: string[] = ["eng"]) {
  ocrQueue.push({ uploadId, languages });
  processQueue();
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (ocrQueue.length > 0) {
    const job = ocrQueue.shift()!;
    try {
      await processOCR(job.uploadId, job.languages);
    } catch (error) {
      console.error("[OCR Queue] Error processing job:", error);
    }
  }

  processing = false;
}

export async function shutdownOCR() {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}
