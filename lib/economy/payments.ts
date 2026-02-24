import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  economyEscrows,
  economyJobs,
  economyTransactions,
  marketplaceDevelopers,
  stripeEvents,
  users,
} from "@/lib/db/schema";
import { requireStripe } from "@/lib/stripe";

const DEFAULT_PLATFORM_FEE_PERCENT = 20;

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export async function createOrGetConnectAccount(userId: string) {
  const s = requireStripe();

  const [existingDeveloper] = await db
    .select()
    .from(marketplaceDevelopers)
    .where(eq(marketplaceDevelopers.userId, userId))
    .limit(1);

  if (existingDeveloper?.stripeAccountId) {
    return existingDeveloper.stripeAccountId;
  }

  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.email) throw new Error("USER_EMAIL_REQUIRED");

  const account = await s.accounts.create({
    type: "express",
    email: user.email,
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { userId },
  });

  if (existingDeveloper) {
    await db
      .update(marketplaceDevelopers)
      .set({ stripeAccountId: account.id, updatedAt: new Date() })
      .where(eq(marketplaceDevelopers.id, existingDeveloper.id));
  } else {
    await db.insert(marketplaceDevelopers).values({
      userId,
      stripeAccountId: account.id,
      stripeOnboardingComplete: false,
      feeTier: "newcomer",
      updatedAt: new Date(),
    });
  }

  return account.id;
}

export async function createOnboardingLink(accountId: string, userId: string) {
  const s = requireStripe();
  const baseUrl = getBaseUrl();
  return s.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/dashboard/jobs?connect=refresh`,
    return_url: `${baseUrl}/dashboard/jobs?connect=success&user=${encodeURIComponent(userId)}`,
    type: "account_onboarding",
  });
}

export async function getConnectStatus(accountId: string) {
  const s = requireStripe();
  const account = await s.accounts.retrieve(accountId);
  return {
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    onboardingComplete: !!(account.charges_enabled && account.payouts_enabled),
  };
}

export async function createJobFundingIntent(jobId: string, clientUserId: string) {
  const s = requireStripe();

  const [job] = await db
    .select({
      id: economyJobs.id,
      clientUserId: economyJobs.clientUserId,
      budgetCents: economyJobs.budgetCents,
      currency: economyJobs.currency,
      status: economyJobs.status,
    })
    .from(economyJobs)
    .where(eq(economyJobs.id, jobId))
    .limit(1);

  if (!job) throw new Error("JOB_NOT_FOUND");
  if (job.clientUserId !== clientUserId) throw new Error("FORBIDDEN_CLIENT_ACTION");
  if (job.status !== "ACCEPTED") throw new Error("JOB_NOT_ACCEPTED");

  const [escrow] = await db
    .select()
    .from(economyEscrows)
    .where(eq(economyEscrows.jobId, jobId))
    .limit(1);

  if (!escrow) throw new Error("ESCROW_NOT_FOUND");

  const paymentIntent = await s.paymentIntents.create({
    amount: job.budgetCents,
    currency: job.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: {
      xpersona_type: "economy_escrow_funding",
      job_id: jobId,
      escrow_id: escrow.id,
      client_user_id: clientUserId,
    },
  });

  await db
    .update(economyEscrows)
    .set({
      stripePaymentIntentId: paymentIntent.id,
      updatedAt: new Date(),
    })
    .where(eq(economyEscrows.id, escrow.id));

  return paymentIntent;
}

export async function markEscrowFundedByPaymentIntent(paymentIntentId: string) {
  const [escrow] = await db
    .select()
    .from(economyEscrows)
    .where(eq(economyEscrows.stripePaymentIntentId, paymentIntentId))
    .limit(1);

  if (!escrow) return;
  if (escrow.status === "FUNDED" || escrow.status === "RELEASED") return;

  await db
    .update(economyEscrows)
    .set({ status: "FUNDED", fundedAt: new Date(), updatedAt: new Date() })
    .where(eq(economyEscrows.id, escrow.id));

  await db.insert(economyTransactions).values({
    jobId: escrow.jobId,
    type: "PAYMENT",
    status: "COMPLETED",
    amountCents: escrow.amountCents,
    feeCents: 0,
    netAmountCents: escrow.amountCents,
    stripePaymentIntentId: paymentIntentId,
    metadata: { source: "webhook" },
    updatedAt: new Date(),
  });
}

export async function releaseEscrowToWorker(jobId: string, platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT) {
  const s = requireStripe();

  const [job] = await db
    .select({
      id: economyJobs.id,
      workerDeveloperId: economyJobs.workerDeveloperId,
      status: economyJobs.status,
    })
    .from(economyJobs)
    .where(eq(economyJobs.id, jobId))
    .limit(1);

  if (!job) throw new Error("JOB_NOT_FOUND");
  if (job.status !== "REVIEW" && job.status !== "COMPLETED") throw new Error("INVALID_RELEASE_STATE");
  if (!job.workerDeveloperId) throw new Error("WORKER_NOT_ASSIGNED");

  const [developer] = await db
    .select()
    .from(marketplaceDevelopers)
    .where(eq(marketplaceDevelopers.id, job.workerDeveloperId))
    .limit(1);

  if (!developer?.stripeAccountId) throw new Error("WORKER_STRIPE_NOT_READY");

  const [escrow] = await db
    .select()
    .from(economyEscrows)
    .where(and(eq(economyEscrows.jobId, jobId), eq(economyEscrows.status, "FUNDED")))
    .limit(1);

  if (!escrow) throw new Error("ESCROW_NOT_FUNDED");

  const feeCents = Math.round((escrow.amountCents * platformFeePercent) / 100);
  const netCents = Math.max(0, escrow.amountCents - feeCents);

  const transfer = await s.transfers.create({
    amount: netCents,
    currency: escrow.currency.toLowerCase(),
    destination: developer.stripeAccountId,
    metadata: {
      xpersona_type: "economy_payout",
      job_id: jobId,
      escrow_id: escrow.id,
    },
  });

  await db.insert(economyTransactions).values([
    {
      jobId,
      type: "EARNINGS",
      status: "COMPLETED",
      amountCents: escrow.amountCents,
      feeCents,
      netAmountCents: netCents,
      stripeTransferId: transfer.id,
      metadata: { workerDeveloperId: job.workerDeveloperId },
      updatedAt: new Date(),
    },
    {
      jobId,
      type: "FEE",
      status: "COMPLETED",
      amountCents: feeCents,
      feeCents: 0,
      netAmountCents: feeCents,
      metadata: { platformFeePercent },
      updatedAt: new Date(),
    },
  ]);

  await db
    .update(economyEscrows)
    .set({ status: "RELEASED", releasedAt: new Date(), updatedAt: new Date() })
    .where(eq(economyEscrows.id, escrow.id));

  await db
    .update(economyJobs)
    .set({ status: "COMPLETED", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(economyJobs.id, jobId));

  return { transferId: transfer.id, feeCents, netCents };
}

export async function refundEscrow(jobId: string, reason: string) {
  const s = requireStripe();

  const [escrow] = await db
    .select()
    .from(economyEscrows)
    .where(eq(economyEscrows.jobId, jobId))
    .limit(1);

  if (!escrow) throw new Error("ESCROW_NOT_FOUND");
  if (escrow.status !== "FUNDED") throw new Error("ESCROW_NOT_REFUNDABLE");
  if (!escrow.stripePaymentIntentId) throw new Error("ESCROW_PAYMENT_INTENT_MISSING");

  const refund = await s.refunds.create({
    payment_intent: escrow.stripePaymentIntentId,
    metadata: {
      xpersona_type: "economy_refund",
      job_id: jobId,
      reason,
    },
  });

  await db
    .update(economyEscrows)
    .set({ status: "REFUNDED", refundedAt: new Date(), updatedAt: new Date() })
    .where(eq(economyEscrows.id, escrow.id));

  await db.insert(economyTransactions).values({
    jobId,
    type: "REFUND",
    status: "COMPLETED",
    amountCents: escrow.amountCents,
    feeCents: 0,
    netAmountCents: escrow.amountCents,
    stripePaymentIntentId: escrow.stripePaymentIntentId,
    stripeRefundId: refund.id,
    metadata: { reason },
    updatedAt: new Date(),
  });

  return refund;
}

export async function ensureWebhookEventNotProcessed(eventId: string, type: string, payload: unknown) {
  try {
    await db.insert(stripeEvents).values({
      stripeEventId: eventId,
      type,
      payload: payload as Record<string, unknown>,
      processedAt: new Date(),
    });
    return true;
  } catch {
    return false;
  }
}