import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticateRequired } from "../middleware/auth";
import {
  createCheckoutSession,
  createPortalSession,
  handleStripeWebhook,
} from "../services/stripe";

export async function billingRoutes(app: FastifyInstance) {
  // POST /api/v1/billing/checkout — Create checkout session
  app.post(
    "/billing/checkout",
    async (
      request: FastifyRequest<{
        Body: { plan: "pro" | "team" };
      }>,
      reply: FastifyReply
    ) => {
      const user = await authenticateRequired(request, reply);
      const { plan } = request.body;

      if (!plan || !["pro", "team"].includes(plan)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "plan must be 'pro' or 'team'",
        });
      }

      try {
        const url = await createCheckoutSession(
          user.userId,
          user.email,
          plan,
          `${process.env.FRONTEND_URL ?? "https://snaplink.io"}/billing/success`,
          `${process.env.FRONTEND_URL ?? "https://snaplink.io"}/billing/cancel`
        );

        return reply.send({ url });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Checkout failed";
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message,
        });
      }
    }
  );

  // POST /api/v1/billing/portal — Create customer portal session
  app.post(
    "/billing/portal",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await authenticateRequired(request, reply);

      try {
        const url = await createPortalSession(
          user.userId,
          `${process.env.FRONTEND_URL ?? "https://snaplink.io"}/settings`
        );

        return reply.send({ url });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Portal creation failed";
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message,
        });
      }
    }
  );

  // POST /api/v1/billing/webhook — Stripe webhook
  app.post(
    "/billing/webhook",
    {
      // `rawBody` is provided by fastify-raw-body when loaded; we cast to
      // sidestep the missing typing and preserve the intent.
      config: { rawBody: true } as Record<string, unknown>,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = request.headers["stripe-signature"];
      if (!signature) {
        return reply.status(400).send({ error: "No stripe-signature header" });
      }

      try {
        const rawBody = (request as FastifyRequest & { rawBody?: Buffer })
          .rawBody;
        if (!rawBody) {
          return reply.status(400).send({ error: "No raw body" });
        }

        await handleStripeWebhook(rawBody, signature as string);
        return reply.send({ received: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Webhook handling failed";
        console.error("[Stripe Webhook] Error:", message);
        return reply.status(400).send({ error: message });
      }
    }
  );
}
