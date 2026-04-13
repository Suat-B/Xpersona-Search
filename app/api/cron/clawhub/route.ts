import { NextRequest, NextResponse } from "next/server";
import { crawlClawHub } from "@/lib/search/crawlers/clawhub";

export const maxDuration = 300;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maxResults = parsePositiveInt(
    process.env.CLAWHUB_CRON_MAX_RESULTS ?? process.env.CRAWL_MAX_RESULTS,
    500
  );

  try {
    const result = await crawlClawHub(Math.min(maxResults, 5000));
    return NextResponse.json({
      success: true,
      source: "CLAWHUB",
      total: result.total,
      jobId: result.jobId,
      config: {
        maxResults: Math.min(maxResults, 5000),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "ClawHub cron failed",
        source: "CLAWHUB",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
