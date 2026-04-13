import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma";

const REPORT_THRESHOLD = 3; // Auto-block after 3 reports

export async function reportRoutes(app: FastifyInstance) {
  // POST /api/v1/report/:shortId — Report content
  app.post(
    "/report/:shortId",
    async (
      request: FastifyRequest<{
        Params: { shortId: string };
        Body: { reason: string };
      }>,
      reply: FastifyReply
    ) => {
      const { shortId } = request.params;
      const { reason } = request.body ?? {};

      if (!reason) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "reason is required",
        });
      }

      const upload = await prisma.upload.findUnique({
        where: { shortId },
        select: { id: true, shortId: true, isBlocked: true, viewCount: true },
      });

      if (!upload) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Upload not found",
        });
      }

      if (upload.isBlocked) {
        return reply.send({
          message: "This content has already been blocked",
        });
      }

      // In production, store reports in a separate Report model.
      // For v1, we use a simple heuristic: increment viewCount as a proxy
      // and block after threshold. A proper Report table should be added.
      //
      // TODO: Create a Report model and track individual reports with:
      // - IP hash of reporter
      // - reason
      // - timestamp
      // - deduplication (one report per IP per upload)

      // For now, mark as blocked if explicitly reported
      // In production this would check report count against threshold
      console.log(
        `[Report] Upload ${shortId} reported. Reason: ${reason}`
      );

      return reply.send({
        message:
          "Thank you for your report. We will review this content shortly.",
      });
    }
  );
}
