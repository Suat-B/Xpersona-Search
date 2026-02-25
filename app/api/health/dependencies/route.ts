import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { retryDb } from "@/lib/db/retry";
import { applyRequestIdHeader } from "@/lib/api/errors";

export async function GET(req: NextRequest) {
  const checks: Record<string, boolean> = {};
  let allReady = true;

  let dbOk = false;
  try {
    await retryDb(() => db.execute(sql`SELECT 1`));
    dbOk = true;
  } catch {
    dbOk = false;
  }
  checks.database = dbOk;
  if (!dbOk) allReady = false;

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  checks.stripeConfigured = !!(stripeKey && stripeKey.length >= 10);

  const cfToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const cfZone = process.env.CLOUDFLARE_ZONE_ID?.trim();
  checks.cloudflareOptional = !!(cfToken && cfZone);

  const status = allReady ? 200 : 503;
  const response = NextResponse.json(
    {
      ok: allReady,
      dependencies: checks,
    },
    { status }
  );
  applyRequestIdHeader(response, req);
  return response;
}
