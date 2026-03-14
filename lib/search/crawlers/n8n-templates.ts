/**
 * n8n templates crawler.
 * Uses the official public templates search API.
 */
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";

const N8N_TEMPLATES_API = "https://api.n8n.io/api/templates/search";

interface N8nNodeCategory {
  name?: string;
}

interface N8nNode {
  name?: string;
  displayName?: string;
  nodeCategories?: N8nNodeCategory[];
}

interface N8nUser {
  username?: string;
  verified?: boolean;
}

interface N8nWorkflow {
  id?: number;
  name?: string;
  description?: string;
  totalViews?: number;
  createdAt?: string;
  user?: N8nUser;
  nodes?: N8nNode[];
}

interface N8nSearchResponse {
  totalWorkflows?: number;
  workflows?: N8nWorkflow[];
}

function scorePopularity(totalViews: number): number {
  if (totalViews <= 0) return 20;
  return Math.min(100, Math.round(Math.log10(totalViews + 1) * 24));
}

function scoreFreshness(createdAt: string | null | undefined): number {
  if (!createdAt) return 42;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 42;
  const daysSince = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(25, Math.round(100 * Math.exp(-daysSince / 240)));
}

function collectCapabilities(workflow: N8nWorkflow): string[] {
  const set = new Set<string>(["workflow", "automation"]);
  const text = `${workflow.name ?? ""} ${workflow.description ?? ""}`.toLowerCase();
  if (text.includes("agent")) set.add("ai agent");
  if (text.includes("chat")) set.add("chatbot");
  if (text.includes("research")) set.add("research");
  if (text.includes("document")) set.add("documents");

  for (const node of workflow.nodes ?? []) {
    const displayName = node.displayName?.trim();
    const nodeName = node.name?.split(".").pop()?.replace(/[-_]/g, " ").trim();
    if (displayName) set.add(displayName);
    if (nodeName) set.add(nodeName);
    for (const category of node.nodeCategories ?? []) {
      if (category.name) set.add(category.name);
    }
  }

  return [...set].slice(0, 20);
}

export function normalizeN8nWorkflow(workflow: N8nWorkflow) {
  const id = workflow.id ?? 0;
  const name = workflow.name?.trim() || `n8n workflow ${id}`;
  const slug =
    generateSlug(`n8n-${id}-${name}`) ||
    `n8n-${id}`;
  const totalViews = Math.max(0, Number(workflow.totalViews ?? 0));
  const popularityScore = scorePopularity(totalViews);
  const freshnessScore = scoreFreshness(workflow.createdAt ?? null);
  const prettySlug = generateSlug(name) ?? slug;
  const homepage = `https://n8n.io/workflows/${id}-${prettySlug}/`;
  return {
    sourceId: `n8n:${id}`,
    source: "N8N_TEMPLATES" as const,
    name,
    slug,
    description: workflow.description ?? null,
    url: homepage,
    homepage,
    capabilities: collectCapabilities(workflow),
    protocols: [] as string[],
    languages: [] as string[],
    openclawData: {
      n8n: {
        totalViews,
        createdAt: workflow.createdAt ?? null,
        author: workflow.user?.username ?? null,
      },
      discoverySignals: {
        installCount: totalViews,
        verified: Boolean(workflow.user?.verified),
        featured: totalViews >= 5000,
        hasManifest: true,
        lastUpdatedAt: workflow.createdAt ?? null,
        repoLinked: false,
      },
    } as Record<string, unknown>,
    readme: workflow.description ?? "",
    safetyScore: 76,
    popularityScore,
    freshnessScore,
    performanceScore: 0,
    overallRank: Math.round((56 + popularityScore * 0.24 + freshnessScore * 0.16) * 10) / 10,
    status: "ACTIVE" as const,
    lastCrawledAt: new Date(),
    nextCrawlAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  };
}

async function fetchN8nPage(limit: number, offset: number): Promise<N8nSearchResponse> {
  const url = new URL(N8N_TEMPLATES_API);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "Xpersona-Crawler/1.0 (https://xpersona.co)",
    },
  });
  if (!res.ok) return {};
  return (await res.json()) as N8nSearchResponse;
}

export async function crawlN8nTemplates(
  maxResults: number = 2000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "N8N_TEMPLATES",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  let totalFound = 0;

  try {
    const pageSize = 100;
    let offset = 0;
    let totalWorkflows = Infinity;

    while (totalFound < maxResults && offset < totalWorkflows) {
      const payload = await fetchN8nPage(pageSize, offset);
      const workflows = payload.workflows ?? [];
      totalWorkflows = Number(payload.totalWorkflows ?? totalWorkflows);
      if (workflows.length === 0) break;

      for (const workflow of workflows) {
        if (totalFound >= maxResults || !workflow.id) break;
        const agentData = normalizeN8nWorkflow(workflow);
        await upsertAgent(agentData, {
          name: agentData.name,
          slug: agentData.slug,
          description: agentData.description,
          url: agentData.url,
          homepage: agentData.homepage,
          capabilities: agentData.capabilities,
          openclawData: agentData.openclawData,
          readme: agentData.readme,
          popularityScore: agentData.popularityScore,
          freshnessScore: agentData.freshnessScore,
          overallRank: agentData.overallRank,
          lastCrawledAt: agentData.lastCrawledAt,
          nextCrawlAt: agentData.nextCrawlAt,
        });
        totalFound += 1;
      }

      offset += pageSize;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    await db
      .update(crawlJobs)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        agentsFound: totalFound,
      })
      .where(eq(crawlJobs.id, jobId));
    return { total: totalFound, jobId };
  } catch (err) {
    await db
      .update(crawlJobs)
      .set({
        status: "FAILED",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(crawlJobs.id, jobId));
    throw err;
  }
}
