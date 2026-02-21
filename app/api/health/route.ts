import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ansCheck = url.searchParams.get("ans") === "1";

  if (!ansCheck) {
    return NextResponse.json({ ok: true });
  }

  const checks: Record<string, boolean> = {};
  let allReady = true;

  const masterKey = process.env.MASTER_ENCRYPTION_KEY?.trim();
  const masterKeyOk =
    typeof masterKey === "string" &&
    masterKey.length === 64 &&
    /^[0-9a-fA-F]+$/.test(masterKey);
  checks.masterEncryptionKey = masterKeyOk;
  if (!masterKeyOk) allReady = false;

  const priceId = process.env.STRIPE_PRICE_ID_ANS_STANDARD?.trim();
  const priceIdOk =
    typeof priceId === "string" &&
    priceId.startsWith("price_") &&
    priceId.length > 10;
  checks.stripePriceIdAns = priceIdOk;
  if (!priceIdOk) allReady = false;

  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
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
  return NextResponse.json(
    {
      ok: allReady,
      ans: {
        ready: allReady,
        checks,
      },
    },
    { status }
  );
}
