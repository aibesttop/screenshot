import Stripe from "stripe";
import { prisma } from "../lib/prisma";
import { Plan } from "@prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

const PRICE_IDS: Record<string, Plan> = {
  [process.env.STRIPE_PRO_PRICE_ID ?? "price_pro"]: "PRO",
  [process.env.STRIPE_TEAM_PRICE_ID ?? "price_team"]: "TEAM",
};

/**
 * Create a Stripe Checkout session for upgrading to Pro or Team.
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  plan: "pro" | "team",
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const priceId =
    plan === "pro"
      ? process.env.STRIPE_PRO_PRICE_ID
      : process.env.STRIPE_TEAM_PRICE_ID;

  if (!priceId) {
    throw new Error(`No Stripe price ID configured for plan: ${plan}`);
  }

  // Get or create Stripe customer
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
  });

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
  });

  return session.url!;
}

/**
 * Create a Stripe Customer Portal session for managing subscriptions.
 */
export async function createPortalSession(
  userId: string,
  returnUrl: string
): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
  });

  if (!user.stripeCustomerId) {
    throw new Error("User has no Stripe customer ID");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Handle Stripe webhooks to update user plans.
 */
export async function handleStripeWebhook(
  body: Buffer,
  signature: string
): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }

  const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (userId && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        const priceId = sub.items.data[0]?.price?.id;
        const plan = priceId ? PRICE_IDS[priceId] : undefined;

        if (plan) {
          await prisma.user.update({
            where: { id: userId },
            data: { plan },
          });
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;

      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
      });

      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { plan: "FREE" },
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const priceId = sub.items.data[0]?.price?.id;
      const plan = priceId ? PRICE_IDS[priceId] : undefined;

      if (plan) {
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { plan },
          });
        }
      }
      break;
    }
  }
}
