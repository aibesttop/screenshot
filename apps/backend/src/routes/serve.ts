import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma";
import { getFile } from "../services/storage";

const AI_USER_AGENTS = [
  "ChatGPT-User",
  "Claude-Web",
  "GPTBot",
  "anthropic-ai",
  "Google-Extended",
  "PerplexityBot",
  "Bytespider",
];

function isAIBot(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return AI_USER_AGENTS.some((bot) =>
    userAgent.toLowerCase().includes(bot.toLowerCase())
  );
}

export async function serveRoutes(app: FastifyInstance) {
  // GET /:shortId — Public image serving (HTML preview or redirect)
  app.get(
    "/:shortId",
    async (
      request: FastifyRequest<{ Params: { shortId: string } }>,
      reply: FastifyReply
    ) => {
      const { shortId } = request.params;

      // Skip API and known paths
      if (
        shortId.startsWith("api") ||
        shortId === "health" ||
        shortId === "raw" ||
        shortId === "favicon.ico"
      ) {
        return reply.status(404).send({ error: "Not found" });
      }

      const upload = await prisma.upload.findUnique({
        where: { shortId },
      });

      if (!upload) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Image not found",
        });
      }

      if (upload.isBlocked) {
        return reply.status(451).send({
          statusCode: 451,
          error: "Unavailable For Legal Reasons",
          message: "This content has been blocked",
        });
      }

      // Check expiration
      if (upload.expiresAt && new Date() > upload.expiresAt) {
        return reply.status(410).send({
          statusCode: 410,
          error: "Gone",
          message: "This image has expired",
        });
      }

      // Handle burn-after-read
      if (upload.burnAfterRead) {
        if (upload.firstViewedAt) {
          return reply.status(410).send({
            statusCode: 410,
            error: "Gone",
            message: "This image was set to burn after read and has already been viewed",
          });
        }

        // Mark as viewed
        await prisma.upload.update({
          where: { shortId },
          data: {
            firstViewedAt: new Date(),
            viewCount: { increment: 1 },
          },
        });
      } else {
        // Increment view count
        await prisma.upload.update({
          where: { shortId },
          data: { viewCount: { increment: 1 } },
        });
      }

      const userAgent = request.headers["user-agent"];

      // AI-friendly HTML for AI bots
      if (isAIBot(userAgent)) {
        const html = `<!DOCTYPE html>
<html>
<head><title>Screenshot</title></head>
<body>
<p>Screenshot shared via SnapLink.</p>
<img src="/raw/${shortId}" alt="${escapeHtml(upload.ocrText ?? "Screenshot")}" />
${upload.ocrText ? `<h2>Extracted Text</h2>\n<pre>${escapeHtml(upload.ocrText)}</pre>` : ""}
</body>
</html>`;
        return reply
          .header("Content-Type", "text/html")
          .header("X-Robots-Tag", "noindex, nofollow")
          .send(html);
      }

      // For regular browsers, serve an HTML preview page
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SnapLink — Screenshot</title>
  <meta property="og:image" content="/raw/${shortId}" />
  <meta property="og:title" content="Screenshot shared via SnapLink" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="/raw/${shortId}" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 2rem; }
    .container { max-width: 1200px; width: 100%; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .header h1 { font-size: 1rem; font-weight: 500; color: #a3a3a3; }
    .header a { color: #60a5fa; text-decoration: none; font-size: 0.875rem; }
    img { max-width: 100%; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.5); }
    .meta { margin-top: 1.5rem; padding: 1rem; background: #171717; border-radius: 8px; font-size: 0.875rem; color: #a3a3a3; }
    .meta span { margin-right: 1.5rem; }
    .ocr { margin-top: 1.5rem; padding: 1rem; background: #171717; border-radius: 8px; }
    .ocr h3 { font-size: 0.875rem; color: #a3a3a3; margin-bottom: 0.5rem; }
    .ocr pre { font-size: 0.8rem; white-space: pre-wrap; word-break: break-word; color: #d4d4d4; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SnapLink</h1>
      <a href="/raw/${shortId}" target="_blank">View raw</a>
    </div>
    <img src="/raw/${shortId}" alt="Screenshot" />
    <div class="meta">
      ${upload.width && upload.height ? `<span>${upload.width}x${upload.height}</span>` : ""}
      <span>${formatBytes(upload.sizeBytes)}</span>
      <span>Views: ${upload.viewCount}</span>
      <span>${upload.createdAt.toISOString()}</span>
    </div>
    ${upload.ocrText ? `<div class="ocr"><h3>Extracted Text</h3><pre>${escapeHtml(upload.ocrText)}</pre></div>` : ""}
  </div>
</body>
</html>`;

      return reply
        .header("Content-Type", "text/html")
        .header("X-Robots-Tag", "noindex, nofollow")
        .send(html);
    }
  );

  // GET /raw/:shortId — Raw image serving
  app.get(
    "/raw/:shortId",
    async (
      request: FastifyRequest<{ Params: { shortId: string } }>,
      reply: FastifyReply
    ) => {
      const { shortId } = request.params;

      const upload = await prisma.upload.findUnique({
        where: { shortId },
      });

      if (!upload) {
        return reply.status(404).send({ error: "Not found" });
      }

      if (upload.isBlocked) {
        return reply.status(451).send({ error: "Content blocked" });
      }

      if (upload.expiresAt && new Date() > upload.expiresAt) {
        return reply.status(410).send({ error: "Expired" });
      }

      if (upload.burnAfterRead && upload.firstViewedAt) {
        return reply.status(410).send({ error: "Burned" });
      }

      try {
        const buffer = await getFile(upload.storageKey);
        return reply
          .header("Content-Type", upload.mimeType)
          .header("Content-Length", buffer.length)
          .header(
            "Cache-Control",
            upload.burnAfterRead
              ? "no-cache, no-store, must-revalidate"
              : "public, max-age=31536000, immutable"
          )
          .header("Content-Disposition", "inline")
          .header("X-Robots-Tag", "noindex, nofollow")
          .send(buffer);
      } catch {
        return reply.status(404).send({ error: "File not found in storage" });
      }
    }
  );

  // GET /:shortId.txt — OCR text only
  app.get(
    "/:shortId.txt",
    async (
      request: FastifyRequest<{ Params: { shortId: string } }>,
      reply: FastifyReply
    ) => {
      // Strip .txt from shortId param — Fastify may include it
      const shortId = request.params.shortId.replace(/\.txt$/, "");

      const upload = await prisma.upload.findUnique({
        where: { shortId },
        select: {
          ocrText: true,
          ocrStatus: true,
          width: true,
          height: true,
          createdAt: true,
          isBlocked: true,
        },
      });

      if (!upload) {
        return reply.status(404).send("Not found");
      }

      if (upload.isBlocked) {
        return reply.status(451).send("Content blocked");
      }

      const text = `[OCR Extracted Text]
${upload.ocrText ?? "(no text extracted)"}

[Metadata]
Screenshot uploaded: ${upload.createdAt.toISOString()}
${upload.width && upload.height ? `Dimensions: ${upload.width}x${upload.height}` : ""}
OCR status: ${upload.ocrStatus.toLowerCase()}`;

      return reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("X-Robots-Tag", "noindex, nofollow")
        .send(text);
    }
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
