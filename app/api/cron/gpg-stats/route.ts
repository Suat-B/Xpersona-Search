import { NextRequest, NextResponse } from "next/server";
import { recomputeAllClusterStats } from "@/lib/gpg/stats";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await recomputeAllClusterStats();
  return NextResponse.json({ success: true, ...result });
}