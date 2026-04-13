import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { prisma } from "../lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/device — Register a device (simplified for v1)
  app.post(
    "/auth/device",
    async (
      request: FastifyRequest<{
        Body: {
          email: string;
          deviceName: string;
          platform: string;
          appVersion: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { email, deviceName, platform, appVersion } = request.body;

      if (!email || !deviceName) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "email and deviceName are required",
        });
      }

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: { email },
        });
      }

      // Generate device token
      const rawToken = crypto.randomBytes(48).toString("base64url");
      const tokenHash = crypto
        .createHmac("sha256", JWT_SECRET)
        .update(rawToken)
        .digest("hex");

      // Create device record
      await prisma.device.create({
        data: {
          userId: user.id,
          name: deviceName,
          platform,
          appVersion,
          tokenHash,
        },
      });

      return reply.status(201).send({
        deviceToken: rawToken,
        user: {
          id: user.id,
          email: user.email,
          plan: user.plan.toLowerCase(),
        },
      });
    }
  );

  // POST /api/v1/auth/device/exchange — Exchange callback code for token
  app.post(
    "/auth/device/exchange",
    async (
      request: FastifyRequest<{
        Body: { code: string; sessionId: string };
      }>,
      reply: FastifyReply
    ) => {
      // In production, this would validate the magic link code
      // For now, return a placeholder to illustrate the flow
      return reply.status(501).send({
        statusCode: 501,
        error: "Not Implemented",
        message:
          "Magic link auth flow not yet implemented. Use POST /api/v1/auth/device directly for development.",
      });
    }
  );

  // POST /api/v1/auth/logout — Revoke device token
  app.post(
    "/auth/logout",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "No token provided",
        });
      }

      const token = authHeader.slice(7);
      const tokenHash = crypto
        .createHmac("sha256", JWT_SECRET)
        .update(token)
        .digest("hex");

      const device = await prisma.device.findUnique({
        where: { tokenHash },
      });

      if (device) {
        await prisma.device.update({
          where: { id: device.id },
          data: { revokedAt: new Date() },
        });
      }

      return reply.status(200).send({ success: true });
    }
  );
}
