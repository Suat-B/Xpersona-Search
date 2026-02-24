import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentCustomizations, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";

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
