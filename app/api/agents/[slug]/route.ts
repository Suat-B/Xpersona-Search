import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentCustomizations, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { resolveNativeDocs } from "@/lib/agents/native-docs";
import { buildAgentCard } from "@/lib/agents/agent-card";
import { extractExecutableExamples } from "@/lib/agents/executable-examples";
import { getTrustSummary } from "@/lib/trust/summary";

let hasAgentCustomizationColumnsCache: boolean | null = null;

function isMissingAgentCustomizationColumnsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('column "verification_tier" does not exist') ||
    msg.includes('column "has_custom_page" does not exist') ||
    msg.includes('column "custom_page_updated_at" does not exist')
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const mode = req.nextUrl.searchParams.get("mode")?.toLowerCase();
  const format = req.nextUrl.searchParams.get("format")?.toLowerCase();
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  async function fetchAgent(includeCustomizationColumns: boolean) {
    if (includeCustomizationColumns) {
      const rows = await db
        .select({
          id: agents.id,
          sourceId: agents.sourceId,
          source: agents.source,
          name: agents.name,
          slug: agents.slug,
          description: agents.description,
          url: agents.url,
          homepage: agents.homepage,
          capabilities: agents.capabilities,
          protocols: agents.protocols,
          languages: agents.languages,
          githubData: agents.githubData,
          npmData: agents.npmData,
          readme: agents.readme,
          codeSnippets: agents.codeSnippets,
          openclawData: agents.openclawData,
          safetyScore: agents.safetyScore,
          popularityScore: agents.popularityScore,
          overallRank: agents.overallRank,
          claimedByUserId: agents.claimedByUserId,
          claimedAt: agents.claimedAt,
          claimStatus: agents.claimStatus,
          ownerOverrides: agents.ownerOverrides,
          verificationTier: agents.verificationTier,
          hasCustomPage: agents.hasCustomPage,
        })
        .from(agents)
        .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
        .limit(1);
      return rows[0] ?? null;
    }

    const rows = await db
      .select({
        id: agents.id,
        sourceId: agents.sourceId,
        source: agents.source,
        name: agents.name,
        slug: agents.slug,
        description: agents.description,
        url: agents.url,
        homepage: agents.homepage,
        capabilities: agents.capabilities,
        protocols: agents.protocols,
        languages: agents.languages,
        githubData: agents.githubData,
        npmData: agents.npmData,
        readme: agents.readme,
        codeSnippets: agents.codeSnippets,
        openclawData: agents.openclawData,
        safetyScore: agents.safetyScore,
        popularityScore: agents.popularityScore,
        overallRank: agents.overallRank,
        claimedByUserId: agents.claimedByUserId,
        claimedAt: agents.claimedAt,
        claimStatus: agents.claimStatus,
        ownerOverrides: agents.ownerOverrides,
      })
      .from(agents)
      .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
      .limit(1);
    return rows[0] ?? null;
  }

  let agent: Record<string, unknown> | null = null;
  const tryExtended = hasAgentCustomizationColumnsCache !== false;
  try {
    agent = (await fetchAgent(tryExtended)) as Record<string, unknown> | null;
    if (tryExtended) hasAgentCustomizationColumnsCache = true;
  } catch (err) {
    if (tryExtended && isMissingAgentCustomizationColumnsError(err)) {
      hasAgentCustomizationColumnsCache = false;
      agent = (await fetchAgent(false)) as Record<string, unknown> | null;
    } else {
      throw err;
    }
  }

  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const overrides = (agent.ownerOverrides ?? {}) as Record<string, unknown>;
  const merged = { ...agent } as Record<string, unknown>;
  merged.claimStatus = (agent.claimStatus as string | null) ?? "UNCLAIMED";
  if (agent.claimStatus === "CLAIMED" && Object.keys(overrides).length > 0) {
    for (const [key, value] of Object.entries(overrides)) {
      if (key !== "customLinks" && value !== undefined) {
        merged[key] = value;
      }
    }
    if (overrides.customLinks) {
      merged.customLinks = overrides.customLinks;
    }
  }

  let claimedByName: string | null = null;
  let isOwner = false;

  if (agent.claimedByUserId) {
    const [owner] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, agent.claimedByUserId as string))
      .limit(1);
    claimedByName = owner?.name ?? "Verified Owner";

    try {
      const authResult = await getAuthUser(req);
      if (!("error" in authResult)) {
        isOwner = authResult.user.id === (agent.claimedByUserId as string);
      }
    } catch {
      /* unauthenticated is fine */
    }
  }

  merged.claimedByName = claimedByName;
  merged.isOwner = isOwner;
  merged.verificationTier = (agent.verificationTier as string | null) ?? "NONE";
  merged.hasCustomPage = Boolean(agent.hasCustomPage ?? false);
  merged.trust = await getTrustSummary(agent.id as string);

  const hasReadme =
    typeof merged.readme === "string" && merged.readme.trim().length > 0;
  const hasDescription =
    typeof merged.description === "string" &&
    merged.description.trim().length > 0;

  if (!hasReadme && !hasDescription) {
    try {
      const docs = await resolveNativeDocs({
        source: merged.source as string | null | undefined,
        sourceId: merged.sourceId as string | null | undefined,
        url: merged.url as string | null | undefined,
        name: merged.name as string | null | undefined,
        npmData: (merged.npmData as { packageName?: string | null } | null) ?? null,
      });
      if (docs?.readme || docs?.description) {
        const readme = docs.readme ?? null;
        const description = docs.description ?? null;
        await db
          .update(agents)
          .set({
            ...(readme ? { readme } : {}),
            ...(description ? { description } : {}),
            lastCrawledAt: new Date(),
          })
          .where(eq(agents.id, agent.id as string));

        if (readme) merged.readme = readme;
        if (description) merged.description = description;
        if (docs.sourceLabel) merged.readmeSource = docs.sourceLabel;
      }
    } catch (err) {
      console.warn("[agent-docs] hydration failed", err);
    }
  }

  const baseUrl = req.nextUrl.origin;
  const examples = extractExecutableExamples(
    typeof merged.readme === "string" ? merged.readme : null
  );
  if (!merged.agentCard || typeof merged.agentCard !== "object") {
    const card = buildAgentCard(
      {
        id: merged.id as string | null | undefined,
        name: merged.name as string | null | undefined,
        slug: merged.slug as string | null | undefined,
        description: merged.description as string | null | undefined,
        url: merged.url as string | null | undefined,
        homepage: merged.homepage as string | null | undefined,
        source: merged.source as string | null | undefined,
        sourceId: merged.sourceId as string | null | undefined,
        protocols: (merged.protocols as string[] | null) ?? null,
        capabilities: (merged.capabilities as string[] | null) ?? null,
        languages: (merged.languages as string[] | null) ?? null,
        npmData: (merged.npmData as { packageName?: string | null } | null) ?? null,
        readmeSource: (merged.readmeSource as string | null | undefined) ?? null,
        examples,
      },
      baseUrl
    );
    merged.agentCard = card;
    try {
      await db
        .update(agents)
        .set({
          agentCard: card as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agent.id as string));
    } catch (err) {
      console.warn("[agent-card] persist failed", err);
    }
  }

  if (format === "card") {
    return NextResponse.json(merged.agentCard ?? {});
  }

  if (mode === "agent") {
    const agentResponse = {
      id: merged.id,
      name: merged.name,
      slug: merged.slug,
      description: merged.description,
      url: merged.url,
      homepage: merged.homepage,
      source: merged.source,
      sourceId: merged.sourceId,
      protocols: merged.protocols,
      capabilities: merged.capabilities,
      languages: merged.languages,
      safetyScore: merged.safetyScore,
      popularityScore: merged.popularityScore,
      freshnessScore: merged.freshnessScore,
      overallRank: merged.overallRank,
      claimStatus: merged.claimStatus,
      verificationTier: merged.verificationTier,
      readme: merged.readme,
      readmeSource: merged.readmeSource,
      agentCard: merged.agentCard,
      trust: merged.trust,
      examples,
      updatedAt: merged.updatedAt,
      lastCrawledAt: merged.lastCrawledAt,
    };
    return NextResponse.json(agentResponse);
  }

  if (agent.hasCustomPage) {
    const [customization] = await db
      .select({
        status: agentCustomizations.status,
        sanitizedHtml: agentCustomizations.sanitizedHtml,
        sanitizedCss: agentCustomizations.sanitizedCss,
        sanitizedJs: agentCustomizations.sanitizedJs,
        widgetLayout: agentCustomizations.widgetLayout,
        updatedAt: agentCustomizations.updatedAt,
      })
      .from(agentCustomizations)
      .where(eq(agentCustomizations.agentId, agent.id as string))
      .limit(1);

    if (customization && customization.status === "PUBLISHED") {
      merged.customPage = {
        html: customization.sanitizedHtml ?? "",
        css: customization.sanitizedCss ?? "",
        js: customization.sanitizedJs ?? "",
        widgetLayout: customization.widgetLayout ?? [],
        updatedAt: customization.updatedAt?.toISOString() ?? null,
      };
    }
  }

  return NextResponse.json(merged);
}
