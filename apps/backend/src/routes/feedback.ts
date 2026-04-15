import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { authenticateOptional } from "../middleware/auth";

interface FeedbackBody {
  category?: "bug" | "feature" | "question" | "other";
  message?: string;
  email?: string | null;
  diagnostics?: Record<string, unknown>;
}

const CATEGORY_MAP = {
  bug: "BUG",
  feature: "FEATURE",
  question: "QUESTION",
  other: "OTHER",
} as const;

function hashIp(ip: string | undefined): string {
  const salt = process.env.IP_HASH_SALT ?? "dev-salt";
  return crypto
    .createHash("sha256")
    .update(`${salt}:${ip ?? "unknown"}`)
    .digest("hex")
    .slice(0, 32);
}

export async function feedbackRoutes(app: FastifyInstance) {
  // POST /api/v1/feedback — Submit beta feedback
  app.post(
    "/feedback",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: FeedbackBody }>,
      reply: FastifyReply
    ) => {
      const { category, message, email, diagnostics } = request.body ?? {};

      if (!message || message.trim().length < 5) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "message is required (min 5 chars)",
        });
      }

      if (message.length > 5000) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "message too long (max 5000 chars)",
        });
      }

      const normalizedCategory = CATEGORY_MAP[category ?? "other"] ?? "OTHER";

      const user = await authenticateOptional(request);

      const userAgent = (request.headers["user-agent"] as string | undefined)
        ?.slice(0, 500);

      try {
        const record = await prisma.feedback.create({
          data: {
            userId: user?.userId ?? null,
            email: email ?? user?.email ?? null,
            category: normalizedCategory as
              | "BUG"
              | "FEATURE"
              | "QUESTION"
              | "OTHER",
            message: message.trim(),
            diagnostics: diagnostics
              ? (diagnostics as object)
              : undefined,
            ipHash: hashIp(request.ip),
            userAgent,
          },
          select: { id: true, createdAt: true },
        });

        request.log.info(
          { feedbackId: record.id, category: normalizedCategory },
          "Feedback received"
        );

        return reply.status(201).send({
          success: true,
          id: record.id,
          receivedAt: record.createdAt.toISOString(),
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Failed to store feedback";
        request.log.error({ err: error }, "Feedback submission failed");
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: msg,
        });
      }
    }
  );
}
