import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { uploadRoutes } from "./routes/upload";
import { authRoutes } from "./routes/auth";
import { serveRoutes } from "./routes/serve";
import { healthRoutes } from "./routes/health";
import { billingRoutes } from "./routes/billing";
import { reportRoutes } from "./routes/report";
import { feedbackRoutes } from "./routes/feedback";
import { startCleanupSchedule } from "./jobs/cleanup";
import dotenv from "dotenv";

dotenv.config();

const PORT = parseInt(process.env.PORT ?? "3456", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty" }
          : undefined,
    },
    bodyLimit: 52_428_800, // 50MB
  });

  // CORS: in production, restrict to an allowlist from env.
  // Desktop/Electron requests send `Origin: null` or no origin — we always
  // allow those because image uploads must work from the desktop app.
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === "production";
  await app.register(cors, {
    origin: (origin, cb) => {
      // No origin (server-to-server, curl, Electron file://) → allow
      if (!origin) return cb(null, true);
      // Non-prod: allow everything for local dev
      if (!isProd) return cb(null, true);
      // Prod: strict allowlist
      if (allowedOrigins.length === 0) {
        // No allowlist configured → reject unknown origins in prod
        return cb(null, false);
      }
      return cb(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 52_428_800, // 50MB
      files: 1,
    },
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(uploadRoutes, { prefix: "/api/v1" });
  await app.register(authRoutes, { prefix: "/api/v1" });
  await app.register(billingRoutes, { prefix: "/api/v1" });
  await app.register(reportRoutes, { prefix: "/api/v1" });
  await app.register(feedbackRoutes, { prefix: "/api/v1" });
  await app.register(serveRoutes);

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`SnapLink backend running on http://${HOST}:${PORT}`);

    // Start background jobs
    startCleanupSchedule();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

export { buildApp };
