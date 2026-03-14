import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedCrawlRequest } from "@/lib/search/crawl-pipeline/http";
import { enqueueSeedTask, seedFetchTasks } from "@/lib/search/crawl-pipeline/seed";

const SeedRequestSchema = z.object({
  scope: z.string().trim().min(1).max(64).optional(),
  limitAgents: z.number().int().min(1).max(100000).optional(),
  limitFrontier: z.number().int().min(1).max(200000).optional(),
  limitMediaFrontier: z.number().int().min(1).max(200000).optional(),
  immediate: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  if (!isAuthorizedCrawlRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = SeedRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const scope = parsed.data.scope ?? "manual";
  const queuedSeedTasks = await enqueueSeedTask(scope, 120);
  let queuedFetchTasks = 0;
  if (parsed.data.immediate) {
    const result = await seedFetchTasks({
      limitAgents: parsed.data.limitAgents,
      limitFrontier: parsed.data.limitFrontier,
      limitMediaFrontier: parsed.data.limitMediaFrontier,
    });
    queuedFetchTasks = result.queued;
  }

  return NextResponse.json({
    ok: true,
    queuedSeedTasks,
    queuedFetchTasks,
    scope,
    generatedAt: new Date().toISOString(),
  });
}
