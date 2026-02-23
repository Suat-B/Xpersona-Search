/**
 * MCP Registry crawler — discovers MCP servers from the official MCP Registry.
 * API: https://registry.modelcontextprotocol.io/v0.1/servers
 */
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { upsertAgent } from "../agent-upsert";
import { eq } from "drizzle-orm";
import { generateSlug } from "../utils/slug";
import { calculateDynamicScores } from "../scoring/rank";

const MCP_REGISTRY_BASE =
  process.env.MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io";
const PAGE_SIZE = 100;

interface McpPackage {
  registryType?: string;
  identifier?: string;
  version?: string;
  transport?: { type?: string };
}

interface McpRemote {
  type?: string;
  url?: string;
}

interface McpServer {
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  repository?: { url?: string; source?: string };
  websiteUrl?: string;
  packages?: McpPackage[];
  remotes?: McpRemote[];
}

interface McpServerEntry {
  server: McpServer;
  _meta?: { "io.modelcontextprotocol.registry/official"?: { status?: string } };
}

interface McpResponse {
  servers?: McpServerEntry[];
  metadata?: { nextCursor?: string; count?: number };
}

function getUrl(server: McpServer): string {
  if (server.repository?.url) return server.repository.url;
  if (server.websiteUrl) return server.websiteUrl;
  const pkg = server.packages?.[0];
  if (pkg?.registryType === "npm" && pkg.identifier) {
    const name = pkg.identifier.replace(/^@/, "").replace("/", "%2F");
    return `https://www.npmjs.com/package/${pkg.identifier}`;
  }
  if (pkg?.registryType === "oci" && pkg.identifier) {
    return `https://hub.docker.com/r/${pkg.identifier.split(":")[0]}`;
  }
  return `https://registry.modelcontextprotocol.io/servers/${encodeURIComponent(server.name ?? "")}`;
}

export async function crawlMcpRegistry(
  maxResults: number = 500
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "MCP_REGISTRY",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  let totalFound = 0;
  let cursor: string | undefined;

  try {
    do {
      const url = new URL(`${MCP_REGISTRY_BASE}/v0.1/servers`);
      url.searchParams.set("limit", String(Math.min(PAGE_SIZE, maxResults - totalFound)));
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`MCP Registry API error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as McpResponse;
      const entries = data.servers ?? [];
      cursor = data.metadata?.nextCursor;

      for (const { server, _meta } of entries) {
        if (totalFound >= maxResults) break;
        const status = _meta?.["io.modelcontextprotocol.registry/official"]?.status;
        if (status === "deleted") continue;

        const name = server.title ?? server.name ?? "MCP Server";
        const sourceId = `mcp-registry:${server.name ?? `unknown-${totalFound}`}`;
        const slug =
          generateSlug(
            (server.name ?? name).replace(/[/@.]/g, "-").toLowerCase()
          ) || `mcp-registry-${totalFound}`;

        const serverUrl = getUrl(server);
        const npmPkg = server.packages?.find((p) => p.registryType === "npm")?.identifier ?? null;

        const dynamicScores = await calculateDynamicScores({
          url: serverUrl,
          homepage: server.websiteUrl,
          npmPackage: npmPkg,
        });

        const agentData = {
          sourceId,
          source: "MCP_REGISTRY" as const,
          name,
          slug,
          description: server.description ?? null,
          url: serverUrl,
          homepage: server.websiteUrl ?? null,
          capabilities: [] as string[],
          protocols: ["MCP"] as string[],
          languages: [] as string[],
          npmData: npmPkg
            ? ({ identifier: npmPkg } as Record<string, unknown>)
            : undefined,
          openclawData: { mcpRegistry: true, serverName: server.name } as Record<string, unknown>,
          readme: null,
          safetyScore: dynamicScores.safetyScore,
          popularityScore: dynamicScores.popularityScore,
          freshnessScore: dynamicScores.freshnessScore,
          performanceScore: 0,
          overallRank: dynamicScores.overallRank,
          status: "ACTIVE" as const,
          lastCrawledAt: new Date(),
          nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };

          await upsertAgent(agentData, {
            name: agentData.name,
            slug: agentData.slug,
            description: agentData.description,
            url: agentData.url,
            homepage: agentData.homepage,
            safetyScore: agentData.safetyScore,
            popularityScore: agentData.popularityScore,
            freshnessScore: agentData.freshnessScore,
            overallRank: agentData.overallRank,
            lastCrawledAt: agentData.lastCrawledAt,
            nextCrawlAt: agentData.nextCrawlAt,
          });

        totalFound++;
      }
    } while (cursor && totalFound < maxResults);

    await db
      .update(crawlJobs)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        agentsFound: totalFound,
      })
      .where(eq(crawlJobs.id, jobId));
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

  return { total: totalFound, jobId };
}
