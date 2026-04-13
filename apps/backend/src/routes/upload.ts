import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { generateShortId } from "../lib/shortid";
import { validateImage, getExtFromMime } from "../lib/image";
import { storeFile } from "../services/storage";

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

      // Generate short ID
      const shortId = await generateShortId(prisma);

      // Store file
      const ext = getExtFromMime(validation.detectedMime);
      const { storageKey, sha256 } = await storeFile(buffer, shortId, ext);

      // Hash IP for privacy
      const ip =
        request.headers["x-forwarded-for"]?.toString().split(",")[0] ??
        request.ip;
      const ipHash = crypto
        .createHmac("sha256", process.env.JWT_SECRET ?? "dev-secret")
        .update(ip)
        .digest("hex");

      // Try to get image dimensions via sharp (optional)
      let width: number | null = null;
      let height: number | null = null;
      try {
        const sharp = await import("sharp");
        const metadata = await sharp.default(buffer).metadata();
        width = metadata.width ?? null;
        height = metadata.height ?? null;
      } catch {
        // sharp not available or image not parseable — skip
      }

      // Create upload record
      const upload = await prisma.upload.create({
        data: {
          shortId,
          storageKey,
          originalName: data.filename,
          mimeType: validation.detectedMime,
          sizeBytes: buffer.length,
          width,
          height,
          sha256,
          burnAfterRead,
          ocrStatus: ocrRequested ? "PENDING" : "SKIPPED",
          ipHash,
        },
      });

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
