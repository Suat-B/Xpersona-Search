/**
 * Cross-source agent deduplication engine.
 * Matches agents across sources by normalizing GitHub URLs, npm package names,
 * and PyPI package names. Merges metadata from duplicate records, keeping the
 * highest-quality record as canonical.
 */
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { sql, eq, and, isNull, ne, or, like } from "drizzle-orm";

interface AgentRow {
  id: string;
  sourceId: string;
  source: string;
  name: string;
  url: string;
  homepage: string | null;
  safetyScore: number;
  popularityScore: number;
  freshnessScore: number;
  overallRank: number;
  canonicalAgentId: string | null;
  aliases: string[];
  githubData: { stars?: number; forks?: number } | null;
  npmData: Record<string, unknown> | null;
}

function extractGitHubRepo(url: string): string | null {
  const m = url.match(/github\.com\/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/);
  if (!m) return null;
  return m[1].replace(/\.git$/, "").toLowerCase();
}

function extractNpmPackage(sourceId: string, url: string): string | null {
  if (sourceId.startsWith("npm:")) return sourceId.replace("npm:", "").toLowerCase();
  const m = url.match(/npmjs\.com\/package\/(@?[a-zA-Z0-9._\/-]+)/);
  if (m) return m[1].toLowerCase();
  return null;
}

function extractPypiPackage(sourceId: string, url: string): string | null {
  if (sourceId.startsWith("pypi:")) return sourceId.replace("pypi:", "").toLowerCase();
  const m = url.match(/pypi\.org\/project\/([a-zA-Z0-9._-]+)/);
  if (m) return m[1].toLowerCase();
  return null;
}

function qualityScore(agent: AgentRow): number {
  let score = agent.overallRank;
  if (agent.githubData?.stars) score += Math.log10(agent.githubData.stars + 1) * 5;
  if (agent.safetyScore > 70) score += 5;
  if (agent.popularityScore > 50) score += 3;
  const sourceBonus: Record<string, number> = {
    GITHUB_OPENCLEW: 10,
    GITHUB_MCP: 8,
    MCP_REGISTRY: 7,
    GITHUB_REPOS: 5,
    CLAWHUB: 5,
    NPM: 4,
    PYPI: 4,
    CURATED_SEEDS: 3,
  };
  score += sourceBonus[agent.source] ?? 0;
  return score;
}

export async function deduplicateAgents(): Promise<{
  groupsFound: number;
  agentsLinked: number;
}> {
  const PAGE_SIZE = 1000;
  let offset = 0;
  let groupsFound = 0;
  let agentsLinked = 0;

  const allAgents: AgentRow[] = [];

  while (true) {
    const batch = await db
      .select({
        id: agents.id,
        sourceId: agents.sourceId,
        source: agents.source,
        name: agents.name,
        url: agents.url,
        homepage: agents.homepage,
        safetyScore: agents.safetyScore,
        popularityScore: agents.popularityScore,
        freshnessScore: agents.freshnessScore,
        overallRank: agents.overallRank,
        canonicalAgentId: agents.canonicalAgentId,
        aliases: agents.aliases,
        githubData: agents.githubData,
        npmData: agents.npmData,
      })
      .from(agents)
      .where(isNull(agents.canonicalAgentId))
      .limit(PAGE_SIZE)
      .offset(offset);

    if (batch.length === 0) break;
    allAgents.push(...(batch as AgentRow[]));
    offset += PAGE_SIZE;
    if (batch.length < PAGE_SIZE) break;
  }

  const ghIndex = new Map<string, AgentRow[]>();
  const npmIndex = new Map<string, AgentRow[]>();
  const pypiIndex = new Map<string, AgentRow[]>();

  for (const agent of allAgents) {
    const urls = [agent.url, agent.homepage].filter(Boolean) as string[];

    for (const url of urls) {
      const ghRepo = extractGitHubRepo(url);
      if (ghRepo) {
        const list = ghIndex.get(ghRepo) ?? [];
        list.push(agent);
        ghIndex.set(ghRepo, list);
      }
    }

    for (const url of [agent.sourceId, ...urls]) {
      const npmPkg = extractNpmPackage(agent.sourceId, url);
      if (npmPkg) {
        const list = npmIndex.get(npmPkg) ?? [];
        list.push(agent);
        npmIndex.set(npmPkg, list);
      }

      const pypiPkg = extractPypiPackage(agent.sourceId, url);
      if (pypiPkg) {
        const list = pypiIndex.get(pypiPkg) ?? [];
        list.push(agent);
        pypiIndex.set(pypiPkg, list);
      }
    }
  }

  const processed = new Set<string>();
  const dupGroups: AgentRow[][] = [];

  for (const [, group] of ghIndex) {
    if (group.length < 2) continue;
    const ids = group.map((a) => a.id).sort().join(",");
    if (processed.has(ids)) continue;
    processed.add(ids);
    dupGroups.push(group);
  }
  for (const [, group] of npmIndex) {
    if (group.length < 2) continue;
    const ids = group.map((a) => a.id).sort().join(",");
    if (processed.has(ids)) continue;
    processed.add(ids);
    dupGroups.push(group);
  }
  for (const [, group] of pypiIndex) {
    if (group.length < 2) continue;
    const ids = group.map((a) => a.id).sort().join(",");
    if (processed.has(ids)) continue;
    processed.add(ids);
    dupGroups.push(group);
  }

  for (const group of dupGroups) {
    const sorted = [...group].sort((a, b) => qualityScore(b) - qualityScore(a));
    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    if (duplicates.length === 0) continue;
    groupsFound++;

    const allAliases = [
      ...(canonical.aliases ?? []),
      ...duplicates.map((d) => d.sourceId),
    ];

    let mergedPopularity = canonical.popularityScore;
    let mergedSafety = canonical.safetyScore;
    for (const dup of duplicates) {
      mergedPopularity = Math.max(mergedPopularity, dup.popularityScore);
      mergedSafety = Math.max(mergedSafety, dup.safetyScore);
    }

    await db
      .update(agents)
      .set({
        aliases: [...new Set(allAliases)],
        popularityScore: mergedPopularity,
        safetyScore: mergedSafety,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, canonical.id));

    for (const dup of duplicates) {
      await db
        .update(agents)
        .set({
          canonicalAgentId: canonical.id,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, dup.id));
      agentsLinked++;
    }
  }

  return { groupsFound, agentsLinked };
}
