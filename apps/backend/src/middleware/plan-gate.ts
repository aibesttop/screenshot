import { FastifyRequest, FastifyReply } from "fastify";
import { authenticateOptional, AuthUser } from "./auth";

/**
 * Rate limits per plan tier.
 */
const PLAN_LIMITS = {
  anonymous: { uploadsPerDay: 10, uploadsPerMonth: 50, maxFileSize: 20 * 1024 * 1024 },
  FREE: { uploadsPerDay: 50, uploadsPerMonth: 500, maxFileSize: 20 * 1024 * 1024 },
  PRO: { uploadsPerDay: 1000, uploadsPerMonth: 20000, maxFileSize: 50 * 1024 * 1024 },
  TEAM: { uploadsPerDay: 5000, uploadsPerMonth: 100000, maxFileSize: 50 * 1024 * 1024 },
  ENTERPRISE: { uploadsPerDay: 50000, uploadsPerMonth: 1000000, maxFileSize: 100 * 1024 * 1024 },
} as const;

export type PlanTier = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: PlanTier) {
  return PLAN_LIMITS[plan];
}

/**
 * Check if a feature is available for a given plan.
 */
export function isFeatureAvailable(
  plan: PlanTier,
  feature:
    | "customExpiration"
    | "customDomain"
    | "multiLangOcr"
    | "teamSpace"
    | "apiAccess"
    | "auditLog"
): boolean {
  const proFeatures = new Set([
    "customExpiration",
    "customDomain",
    "multiLangOcr",
    "apiAccess",
    "auditLog",
  ]);
  const teamFeatures = new Set(["teamSpace"]);

  if (teamFeatures.has(feature)) {
    return plan === "TEAM" || plan === "ENTERPRISE";
  }
  if (proFeatures.has(feature)) {
    return plan === "PRO" || plan === "TEAM" || plan === "ENTERPRISE";
  }
  return true;
}

/**
 * Middleware to gate Pro-only features.
 * Returns 402 if the user's plan doesn't support the requested feature.
 */
export function requirePlan(minimumPlan: "PRO" | "TEAM" | "ENTERPRISE") {
  const planOrder = { FREE: 0, PRO: 1, TEAM: 2, ENTERPRISE: 3 };

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await authenticateOptional(request);

    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Authentication required for this feature",
      });
    }

    const userPlanLevel = planOrder[user.plan] ?? 0;
    const requiredLevel = planOrder[minimumPlan];

    if (userPlanLevel < requiredLevel) {
      return reply.status(402).send({
        statusCode: 402,
        error: "Payment Required",
        message: `This feature requires a ${minimumPlan} plan or higher. Current plan: ${user.plan}`,
        requiredPlan: minimumPlan.toLowerCase(),
        currentPlan: user.plan.toLowerCase(),
      });
    }
  };
}
