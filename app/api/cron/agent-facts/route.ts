import { NextRequest, NextResponse } from "next/server";
import {
  materializeAgentEvidence,
  selectNightlyAgentCandidates,
} from "@/lib/agents/evidence-materializer";
import {
  completeJob,
  failJob,
  heartbeatJob,
  startJob,
} from "@/lib/search/crawlers/job-lifecycle";

const SOURCE = "AGENT_FACTS_BACKFILL";

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

  const limit = parsePositiveInt(process.env.AGENT_FACTS_CRON_LIMIT, 3000);
  const recentWindowHours = parsePositiveInt(
    process.env.AGENT_FACTS_RECENT_WINDOW_HOURS,
    48
  );
  const staleAfterHours = parsePositiveInt(
    process.env.AGENT_FACTS_STALE_AFTER_HOURS,
    168
  );

  const { jobId } = await startJob({
    source: SOURCE,
    mode: "cron",
    workerId: "cron-agent-facts",
  });

  let scanned = 0;
  let updatedAgents = 0;
  let factsInserted = 0;
  let changeEventsInserted = 0;
  const failures: Array<{ slug: string; message: string }> = [];

  try {
    const candidates = await selectNightlyAgentCandidates({
      limit,
      recentWindowHours,
      staleAfterHours,
    });

    for (const candidate of candidates) {
      scanned += 1;
      try {
        const result = await materializeAgentEvidence({
          agentId: candidate.agentId,
          slug: candidate.slug,
        });
        if (!result) {
          failures.push({
            slug: candidate.slug,
            message: "Agent was missing or not eligible for public materialization.",
          });
          continue;
        }

        updatedAgents += 1;
        factsInserted += result.factsInserted;
        changeEventsInserted += result.changeEventsInserted;
      } catch (error) {
        failures.push({
          slug: candidate.slug,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (scanned % 50 === 0) {
        await heartbeatJob(jobId, {
          agentsFound: scanned,
          agentsUpdated: updatedAgents,
          skipped: failures.length,
          cursorSnapshot: { lastSlug: candidate.slug },
        });
      }
    }

    await completeJob(jobId, {
      agentsFound: scanned,
      agentsUpdated: updatedAgents,
      skipped: failures.length,
      finishedReason: failures.length > 0 ? "completed_with_failures" : "completed",
      cursorSnapshot: {
        factsInserted,
        changeEventsInserted,
        failureCount: failures.length,
      },
    });

    const response = {
      success: failures.length === 0 || updatedAgents > 0,
      source: SOURCE,
      jobId,
      scanned,
      updatedAgents,
      factsInserted,
      changeEventsInserted,
      failureCount: failures.length,
      failures: failures.slice(0, 50),
      config: {
        limit,
        recentWindowHours,
        staleAfterHours,
      },
    };

    console.info("[cron-agent-facts]", JSON.stringify(response));
    return NextResponse.json(response);
  } catch (error) {
    await failJob(jobId, error, {
      agentsFound: scanned,
      agentsUpdated: updatedAgents,
      skipped: failures.length,
      finishedReason: "failed_agent_facts_cron",
      cursorSnapshot: {
        factsInserted,
        changeEventsInserted,
      },
    });
    console.error("[cron-agent-facts]", error);
    return NextResponse.json(
      {
        error: "Agent facts cron failed",
        jobId,
      },
      { status: 500 }
    );
  }
}

