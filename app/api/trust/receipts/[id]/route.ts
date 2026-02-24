import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trustReceipts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasTrustTable } from "@/lib/trust/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (!(await hasTrustTable("trust_receipts"))) {
    return NextResponse.json({ error: "Trust tables not ready" }, { status: 503 });
  }

  const rows = await db
    .select()
    .from(trustReceipts)
    .where(eq(trustReceipts.id, id))
    .limit(1);

  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}
