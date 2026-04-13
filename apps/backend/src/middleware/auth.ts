import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

export interface AuthUser {
  userId: string;
  deviceId: string;
  email: string;
  plan: "FREE" | "PRO" | "TEAM" | "ENTERPRISE";
}

export async function authenticateOptional(
  request: FastifyRequest
): Promise<AuthUser | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const tokenHash = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(token)
    .digest("hex");

  const device = await prisma.device.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!device || device.revokedAt) {
    return null;
  }

  // Update last seen
  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  return {
    userId: device.userId,
    deviceId: device.id,
    email: device.user.email,
    plan: device.user.plan,
  };
}

export async function authenticateRequired(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AuthUser> {
  const user = await authenticateOptional(request);
  if (!user) {
    reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Valid authentication token required",
    });
    throw new Error("Unauthorized");
  }
  return user;
}
