import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { generateShortId } from "../lib/shortid";
import { validateImage, getExtFromMime } from "../lib/image";
import { storeFile } from "../services/storage";
import { stripExifMetadata, getImageDimensions } from "../services/exif";
import { moderateImage } from "../services/moderation";
import { enqueueOCR } from "../services/ocr";

const SHORT_URL_DOMAIN =
  process.env.SHORT_URL_DOMAIN ?? "http://localhost:3456";

export async function uploadRoutes(app: FastifyInstance) {
  // POST /api/v1/upload — Upload a screenshot
  app.post(
    "/upload",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "No file provided",
        });
      }

      const buffer = await data.toBuffer();
      const claimedMime = data.mimetype;

      // Validate image
      const validation = validateImage(buffer, claimedMime);
      if (!validation.valid) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: validation.error,
        });
      }

      // Parse upload options from fields
      const fields = data.fields as Record<
        string,
        { value?: string } | undefined
      >;
      const burnAfterRead =
        (fields.burn_after_read as { value?: string } | undefined)?.value ===
        "true";
      const ocrRequested =
        (fields.ocr as { value?: string } | undefined)?.value !== "false";

      // Content moderation
      const modResult = await moderateImage(buffer);
      if (!modResult.safe && !modResult.needsReview) {
        return reply.status(451).send({
          statusCode: 451,
          error: "Unavailable For Legal Reasons",
          message: "This image has been rejected by content moderation",
        });
      }

      // Strip EXIF metadata for privacy
      const stripExif =
        (fields.strip_exif as { value?: string } | undefined)?.value !== "false";
      const processedBuffer = stripExif
        ? await stripExifMetadata(buffer)
        : buffer;

      // Get image dimensions
      const dimensions = await getImageDimensions(processedBuffer);
      const width = dimensions?.width ?? null;
      const height = dimensions?.height ?? null;

      // Generate short ID
      const shortId = await generateShortId(prisma);

      // Store file
      const ext = getExtFromMime(validation.detectedMime);
      const { storageKey, sha256 } = await storeFile(processedBuffer, shortId, ext);

      // Hash IP for privacy
      const ip =
        request.headers["x-forwarded-for"]?.toString().split(",")[0] ??
        request.ip;
      const ipHash = crypto
        .createHmac("sha256", process.env.JWT_SECRET ?? "dev-secret")
        .update(ip)
        .digest("hex");

      // Parse expiration
      const expiresInRaw =
        (fields.expires_in as { value?: string } | undefined)?.value;
      let expiresAt: Date | null = null;
      if (expiresInRaw && expiresInRaw !== "never") {
        const durations: Record<string, number> = {
          "1h": 60 * 60 * 1000,
          "1d": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
        };
        const ms = durations[expiresInRaw];
        if (ms) expiresAt = new Date(Date.now() + ms);
      }

      // Create upload record
      const upload = await prisma.upload.create({
        data: {
          shortId,
          storageKey,
          originalName: data.filename,
          mimeType: validation.detectedMime,
          sizeBytes: processedBuffer.length,
          width,
          height,
          sha256,
          burnAfterRead,
          expiresAt,
          ocrStatus: ocrRequested ? "PENDING" : "SKIPPED",
          ipHash,
        },
      });

      // Enqueue OCR processing asynchronously
      if (ocrRequested) {
        enqueueOCR(upload.id);
      }

      const url = `${SHORT_URL_DOMAIN}/${shortId}`;
      const rawUrl = `${SHORT_URL_DOMAIN}/raw/${shortId}`;

      return reply.status(201).send({
        id: upload.shortId,
        url,
        rawUrl,
        markdown: `![](${url})`,
        html: `<img src="${url}" />`,
        expiresAt: upload.expiresAt,
        burnAfterRead: upload.burnAfterRead,
        ocrStatus: upload.ocrStatus.toLowerCase(),
        size: upload.sizeBytes,
        width: upload.width,
        height: upload.height,
      });
    }
  );

  // GET /api/v1/upload/:shortId — Get upload metadata
  app.get(
    "/upload/:shortId",
    async (
      request: FastifyRequest<{ Params: { shortId: string } }>,
      reply: FastifyReply
    ) => {
      const { shortId } = request.params;

      const upload = await prisma.upload.findUnique({
        where: { shortId },
      });

      if (!upload) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Upload not found",
        });
      }

      if (upload.isBlocked) {
        return reply.status(451).send({
          statusCode: 451,
          error: "Unavailable For Legal Reasons",
          message: "This content has been blocked",
        });
      }

      return reply.send({
        id: upload.shortId,
        url: `${SHORT_URL_DOMAIN}/${upload.shortId}`,
        createdAt: upload.createdAt.toISOString(),
        expiresAt: upload.expiresAt?.toISOString() ?? null,
        viewCount: upload.viewCount,
        ocrText: upload.ocrText,
        width: upload.width,
        height: upload.height,
      });
    }
  );

  // GET /api/v1/uploads — List uploads (paginated)
  app.get(
    "/uploads",
    async (
      request: FastifyRequest<{
        Querystring: {
          limit?: string;
          cursor?: string;
          project_id?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const limit = Math.min(parseInt(request.query.limit ?? "20", 10), 100);
      const cursor = request.query.cursor;

      const uploads = await prisma.upload.findMany({
        take: limit + 1,
        ...(cursor
          ? {
              cursor: { id: cursor },
              skip: 1,
            }
          : {}),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          shortId: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          width: true,
          height: true,
          ocrText: true,
          ocrStatus: true,
          burnAfterRead: true,
          expiresAt: true,
          viewCount: true,
          createdAt: true,
        },
      });

      const hasMore = uploads.length > limit;
      const items = hasMore ? uploads.slice(0, limit) : uploads;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return reply.send({
        items: items.map((u) => ({
          id: u.shortId,
          url: `${SHORT_URL_DOMAIN}/${u.shortId}`,
          rawUrl: `${SHORT_URL_DOMAIN}/raw/${u.shortId}`,
          originalName: u.originalName,
          mimeType: u.mimeType,
          sizeBytes: u.sizeBytes,
          width: u.width,
          height: u.height,
          ocrText: u.ocrText,
          ocrStatus: u.ocrStatus.toLowerCase(),
          burnAfterRead: u.burnAfterRead,
          expiresAt: u.expiresAt?.toISOString() ?? null,
          viewCount: u.viewCount,
          createdAt: u.createdAt.toISOString(),
        })),
        cursor: nextCursor,
        hasMore,
      });
    }
  );

  // DELETE /api/v1/upload/:shortId
  app.delete(
    "/upload/:shortId",
    async (
      request: FastifyRequest<{ Params: { shortId: string } }>,
      reply: FastifyReply
    ) => {
      const { shortId } = request.params;

      const upload = await prisma.upload.findUnique({
        where: { shortId },
      });

      if (!upload) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Upload not found",
        });
      }

      await prisma.upload.delete({ where: { shortId } });

      // Delete file from storage asynchronously
      import("../services/storage").then(({ deleteFile }) =>
        deleteFile(upload.storageKey)
      );

      return reply.status(204).send();
    }
  );
}
