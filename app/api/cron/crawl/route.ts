import { NextRequest, NextResponse } from "next/server";
import { crawlOpenClawSkills } from "@/lib/search/crawlers/github-openclaw";

export const maxDuration = 300; // 5 min for Vercel Pro

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { total, jobId } = await crawlOpenClawSkills(since, 200);
    return NextResponse.json({
      success: true,
      total,
      jobId,
    });
  } catch (err) {
    console.error("[Crawl] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Crawl failed" },
      { status: 500 }
    );
  }
}
