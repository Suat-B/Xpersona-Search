import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditPackages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const list = await db
    .select({
      id: creditPackages.id,
      name: creditPackages.name,
      credits: creditPackages.credits,
      amountCents: creditPackages.amountCents,
      stripePriceId: creditPackages.stripePriceId,
    })
    .from(creditPackages)
    .where(eq(creditPackages.active, true))
    .orderBy(creditPackages.sortOrder);
  return NextResponse.json({ success: true, data: list });
}
