import { db } from "@/lib/db";
import { crawlDomainPolicies, crawlDomainStats } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export interface EffectiveDomainPolicy {
  domain: string;
  mode: "ALLOW" | "BLOCK";
  rpmLimit: number;
  cooldownUntil: Date | null;
  blockedReason: string | null;
}

const DEFAULT_RPM_LIMIT = Number(
  process.env.SEARCH_CRAWL_DOMAIN_DEFAULT_RPM ??
    process.env.SEARCH_MEDIA_DOMAIN_DEFAULT_RPM ??
    "30"
);
const DEFAULT_FAIL_THRESHOLD = Number(
  process.env.SEARCH_CRAWL_DOMAIN_FAIL_THRESHOLD ??
    process.env.SEARCH_MEDIA_DOMAIN_FAIL_THRESHOLD ??
    "8"
);
const DEFAULT_COOLDOWN_MS = Number(
  process.env.SEARCH_CRAWL_DOMAIN_FAIL_COOLDOWN_MS ??
    process.env.SEARCH_MEDIA_DOMAIN_FAIL_COOLDOWN_MS ??
    "900000"
);

export async function getEffectiveDomainPolicy(
  domain: string
): Promise<EffectiveDomainPolicy> {
  const [row] = await db
    .select({
      domain: crawlDomainPolicies.domain,
      mode: crawlDomainPolicies.mode,
      rpmLimit: crawlDomainPolicies.rpmLimit,
      cooldownUntil: crawlDomainPolicies.cooldownUntil,
      reason: crawlDomainPolicies.reason,
    })
    .from(crawlDomainPolicies)
    .where(eq(crawlDomainPolicies.domain, domain))
    .limit(1);

  return {
    domain,
    mode: (row?.mode?.toUpperCase() === "BLOCK" ? "BLOCK" : "ALLOW") as "ALLOW" | "BLOCK",
    rpmLimit: Math.max(1, Number(row?.rpmLimit ?? DEFAULT_RPM_LIMIT)),
    cooldownUntil: row?.cooldownUntil ?? null,
    blockedReason: row?.reason ?? null,
  };
}

export async function shouldAllowDomainFetch(domain: string): Promise<{
  allow: boolean;
  reason: string | null;
  retryAfterMs: number;
}> {
  const policy = await getEffectiveDomainPolicy(domain);
  if (policy.mode === "BLOCK") {
    return {
      allow: false,
      reason: policy.blockedReason ?? "blocked_by_policy",
      retryAfterMs: 60 * 60_000,
    };
  }
  const now = Date.now();
  if (policy.cooldownUntil && policy.cooldownUntil.getTime() > now) {
    return {
      allow: false,
      reason: "domain_cooldown",
      retryAfterMs: policy.cooldownUntil.getTime() - now,
    };
  }

  const [stats] = await db
    .select({
      lastSeenAt: crawlDomainStats.lastSeenAt,
    })
    .from(crawlDomainStats)
    .where(eq(crawlDomainStats.domain, domain))
    .limit(1);
  if (!stats?.lastSeenAt) {
    return { allow: true, reason: null, retryAfterMs: 0 };
  }
  const minIntervalMs = Math.ceil(60_000 / Math.max(1, policy.rpmLimit));
  const elapsed = now - stats.lastSeenAt.getTime();
  if (elapsed < minIntervalMs) {
    return {
      allow: false,
      reason: "domain_rate_limited",
      retryAfterMs: minIntervalMs - elapsed,
    };
  }
  return { allow: true, reason: null, retryAfterMs: 0 };
}

export async function recordDomainSuccess(domain: string): Promise<void> {
  await db
    .insert(crawlDomainStats)
    .values({
      domain,
      successCount: 1,
      failCount: 0,
      timeoutCount: 0,
      lastStatus: "success",
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: crawlDomainStats.domain,
      set: {
        successCount: sql`${crawlDomainStats.successCount} + 1`,
        lastStatus: "success",
        lastError: null,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function recordDomainFailure(params: {
  domain: string;
  error: string;
  timedOut?: boolean;
}): Promise<void> {
  const domain = params.domain;
  await db
    .insert(crawlDomainStats)
    .values({
      domain,
      successCount: 0,
      failCount: 1,
      timeoutCount: params.timedOut ? 1 : 0,
      lastStatus: "failed",
      lastError: params.error.slice(0, 1000),
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: crawlDomainStats.domain,
      set: {
        failCount: sql`${crawlDomainStats.failCount} + 1`,
        timeoutCount: params.timedOut
          ? sql`${crawlDomainStats.timeoutCount} + 1`
          : crawlDomainStats.timeoutCount,
        lastStatus: "failed",
        lastError: params.error.slice(0, 1000),
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    });

  const [stats] = await db
    .select({
      failCount: crawlDomainStats.failCount,
    })
    .from(crawlDomainStats)
    .where(eq(crawlDomainStats.domain, domain))
    .limit(1);

  if (Number(stats?.failCount ?? 0) >= DEFAULT_FAIL_THRESHOLD) {
    await db
      .insert(crawlDomainPolicies)
      .values({
        domain,
        mode: "ALLOW",
        cooldownUntil: new Date(Date.now() + DEFAULT_COOLDOWN_MS),
        reason: "auto_cooldown_fail_spike",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: crawlDomainPolicies.domain,
        set: {
          cooldownUntil: new Date(Date.now() + DEFAULT_COOLDOWN_MS),
          reason: "auto_cooldown_fail_spike",
          updatedAt: new Date(),
        },
      });
  }
}

export async function setDomainPolicy(params: {
  domain: string;
  mode: "ALLOW" | "BLOCK";
  rpmLimit?: number;
  reason?: string | null;
  cooldownUntil?: Date | null;
  updatedBy?: string | null;
}): Promise<void> {
  await db
    .insert(crawlDomainPolicies)
    .values({
      domain: params.domain,
      mode: params.mode,
      rpmLimit: Math.max(1, Math.floor(params.rpmLimit ?? DEFAULT_RPM_LIMIT)),
      reason: params.reason ?? null,
      cooldownUntil: params.cooldownUntil ?? null,
      updatedBy: params.updatedBy ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: crawlDomainPolicies.domain,
      set: {
        mode: params.mode,
        rpmLimit: Math.max(1, Math.floor(params.rpmLimit ?? DEFAULT_RPM_LIMIT)),
        reason: params.reason ?? null,
        cooldownUntil: params.cooldownUntil ?? null,
        updatedBy: params.updatedBy ?? null,
        updatedAt: new Date(),
      },
    });
}
