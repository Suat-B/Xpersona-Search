import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentContentVersions, agentEditorialContent } from "@/lib/db/schema";
import { resolveEditorialContent } from "@/lib/agents/editorial-content";

function summarizeReadme(readme: string | null): string | null {
  if (!readme) return null;
  const plain = readme
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[[^\]]+\]\([^)]*\)/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  return plain.slice(0, 420);
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function run(limit = 1500) {
  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      description: agents.description,
      capabilities: agents.capabilities,
      protocols: agents.protocols,
      source: agents.source,
      readme: agents.readme,
      openclawData: agents.openclawData,
      updatedAt: agents.updatedAt,
      url: agents.url,
      homepage: agents.homepage,
    })
    .from(agents)
    .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)))
    .limit(limit);

  let processed = 0;
  for (const row of rows) {
    const editorial = await resolveEditorialContent({
      agentId: row.id,
      name: row.name,
      description: row.description,
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
      protocols: Array.isArray(row.protocols) ? row.protocols : [],
      source: row.source,
      readmeExcerpt: summarizeReadme(row.readme),
      updatedAtIso: row.updatedAt?.toISOString() ?? null,
      openclawData: (row.openclawData as Record<string, unknown> | null) ?? null,
      sourceUrl: row.url,
      homepage: row.homepage,
    });

    const workflowsMd = editorial.sections.workflows.map((item) => `- ${item}`).join("\n");
    const snapshot = JSON.stringify({
      sections: editorial.sections,
      quality: editorial.quality,
      setupComplexity: editorial.setupComplexity,
      useCases: editorial.useCases,
      dataSources: editorial.dataSources,
      lastReviewedAt: editorial.lastReviewedAt,
    });
    const versionHash = sha256(snapshot);

    await db
      .insert(agentEditorialContent)
      .values({
        agentId: row.id,
        overviewMd: editorial.sections.overview,
        bestForMd: editorial.sections.bestFor,
        notForMd: editorial.sections.notFor,
        setupMd: editorial.sections.setup,
        workflowsMd,
        limitationsMd: editorial.sections.limitations,
        alternativesMd: editorial.sections.alternatives,
        faqJson: editorial.sections.faq,
        releaseHighlights: editorial.sections.releaseHighlights,
        qualityScore: editorial.quality.score,
        wordCount: editorial.quality.wordCount,
        uniquenessScore: editorial.quality.uniquenessScore,
        lastReviewedAt: new Date(editorial.lastReviewedAt),
        status: editorial.quality.status === "ready" ? "READY" : "THIN",
      })
      .onConflictDoUpdate({
        target: agentEditorialContent.agentId,
        set: {
          overviewMd: editorial.sections.overview,
          bestForMd: editorial.sections.bestFor,
          notForMd: editorial.sections.notFor,
          setupMd: editorial.sections.setup,
          workflowsMd,
          limitationsMd: editorial.sections.limitations,
          alternativesMd: editorial.sections.alternatives,
          faqJson: editorial.sections.faq,
          releaseHighlights: editorial.sections.releaseHighlights,
          qualityScore: editorial.quality.score,
          wordCount: editorial.quality.wordCount,
          uniquenessScore: editorial.quality.uniquenessScore,
          lastReviewedAt: new Date(editorial.lastReviewedAt),
          status: editorial.quality.status === "ready" ? "READY" : "THIN",
          updatedAt: new Date(),
        },
      });

    await db
      .insert(agentContentVersions)
      .values({
        agentId: row.id,
        versionHash,
        source: "BACKFILL",
        contentSnapshot: JSON.parse(snapshot) as Record<string, unknown>,
      })
      .onConflictDoNothing({
        target: [agentContentVersions.agentId, agentContentVersions.versionHash],
      });

    processed += 1;
    if (processed % 100 === 0) {
      console.log(`[editorial-backfill] processed ${processed}/${rows.length}`);
    }
  }

  console.log(`[editorial-backfill] done. processed ${processed}`);
}

const arg = process.argv[2];
const limit = arg ? Number(arg) : 1500;
run(Number.isFinite(limit) && limit > 0 ? limit : 1500).catch((err) => {
  console.error("[editorial-backfill] failed", err);
  process.exit(1);
});
