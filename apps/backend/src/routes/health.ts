import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { getStorageBackend } from "../services/storage";

export async function healthRoutes(app: FastifyInstance) {
  // Lightweight liveness probe — always cheap, never fails.
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Deep readiness probe — checks DB connectivity and storage backend.
  app.get("/health/ready", async (_request, reply) => {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { ok: true };
    } catch (err) {
      checks.database = {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    checks.storage = { ok: true, detail: getStorageBackend() };

    const allOk = Object.values(checks).every((c) => c.ok);
    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    });
  });
}
