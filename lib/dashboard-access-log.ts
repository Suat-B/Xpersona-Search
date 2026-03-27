import { db } from "@/lib/db";
import { dashboardAccessEvents } from "@/lib/db/schema";
import { getCrawlerName } from "@/lib/bot-detect";

const UA_MAX = 512;
const REF_MAX = 512;
const PATH_MAX = 2048;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function firstForwardedIp(xff: string | null): string | null {
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first && first.length > 0 ? truncate(first, 128) : null;
}

function shouldSample(): boolean {
  const raw = process.env.DASHBOARD_ACCESS_LOG_SAMPLE_RATE?.trim();
  const rate = raw === undefined || raw === "" ? 1 : Number(raw);
  if (!Number.isFinite(rate)) return true;
  const r = Math.min(1, Math.max(0, rate));
  if (r <= 0) return false;
  if (r >= 1) return true;
  return Math.random() < r;
}

export type DashboardAccessOutcome = "redirect_signin" | "rendered";

/**
 * Fire-and-forget insert for dashboard path hits. Respects DASHBOARD_ACCESS_LOG_SAMPLE_RATE (0–1).
 */
export function recordDashboardAccessEvent(input: {
  path: string;
  outcome: DashboardAccessOutcome;
  userAgent: string | null;
  xForwardedFor: string | null;
  referer: string | null;
}): void {
  if (!shouldSample()) return;

  const ua = input.userAgent ?? "";
  const botLabel = getCrawlerName(ua);
  const path = truncate((input.path || "/").replace(/\s+/g, " "), PATH_MAX);

  void db
    .insert(dashboardAccessEvents)
    .values({
      path,
      outcome: input.outcome,
      userAgent: truncate(ua, UA_MAX),
      clientIp: firstForwardedIp(input.xForwardedFor),
      referer: input.referer ? truncate(input.referer, REF_MAX) : null,
      botLabel: botLabel ? truncate(botLabel, 64) : null,
    })
    .catch((err) => {
      console.error("[dashboard-access-log] insert failed:", err);
    });
}
