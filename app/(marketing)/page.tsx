import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAgentCookieName, verifyAgentToken } from "@/lib/auth-utils";
import { SearchLanding } from "@/components/home/SearchLanding";
import { GoogleStyleHomeClient as GoogleStyleHome } from "@/components/home/GoogleStyleHomeClient";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  let session = null;
  try {
    session = await auth();
  } catch {}

  const cookieStore = await cookies();
  const agentCookie = cookieStore.get(getAgentCookieName())?.value;
  const agentUserId = agentCookie ? verifyAgentToken(agentCookie) : null;
  const isAuthenticated = !!(session?.user || agentUserId);

  const params = await searchParams;
  const hasSearchQuery = !!params?.q?.trim();
  const hasProtocolFilter = !!params?.protocols?.trim();
  const hasBrowse = params?.browse === "1" || params?.browse === "true";
  const searchStateKeys = new Set([
    "q",
    "protocols",
    "browse",
    "minSafety",
    "sort",
    "limit",
    "vertical",
    "intent",
    "taskType",
    "maxLatencyMs",
    "maxCostUsd",
    "dataRegion",
    "requires",
    "forbidden",
    "bundle",
    "explain",
    "cursor",
  ]);
  const hasSearchState = Object.entries(params ?? {}).some(
    ([key, value]) => searchStateKeys.has(key) && typeof value === "string" && value.trim().length > 0
  );

  const capabilityMetadata = {
    "@context": ["https://schema.org", "https://xpersona.co/context/v1"],
    "@type": "WebSite",
    name: "Xpersona",
    url: "https://xpersona.co",
    description: "Xpersona is an AI search engine for discovering AI agents, skills, and tools.",
    publisher: {
      "@type": "Organization",
      name: "Xpersona",
      url: "https://xpersona.co",
    },
    potentialAction: {
      "@type": "SearchAction",
      target: "https://xpersona.co/?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
    hasPart: [
      {
        "@type": "Service",
        name: "Xpersona Search",
        serviceType: "AI agent search engine",
        category: "AI search",
        url: "https://xpersona.co",
        description: "Search and discover AI agents, skills, and tools with protocol and reliability filters.",
        provider: { "@type": "Organization", name: "Xpersona" },
        availableChannel: {
          "@type": "ServiceChannel",
          serviceUrl: "https://xpersona.co",
        },
        featureList: [
          "Agent discovery",
          "Skill search",
          "Protocol filters",
          "Reliability metrics",
          "Graph exploration",
        ],
      },
      {
        "@type": "AgentCard",
        name: "Example: Research Agent",
        description: "Finds and summarizes trustworthy sources for research tasks.",
        endpoint: "https://xpersona.co/agent/example-research",
        domain: "research",
        protocols: ["mcp", "openclaw"],
        capabilities: ["search", "summarize", "citations"],
        verified: false,
      },
      {
        "@type": "AgentCard",
        name: "Example: Automation Agent",
        description: "Automates workflows across tools with approval gates.",
        endpoint: "https://xpersona.co/agent/example-automation",
        domain: "automation",
        protocols: ["mcp"],
        capabilities: ["workflow", "integrations", "scheduling"],
        verified: false,
      },
      {
        "@type": "AgentCard",
        name: "Example: Developer Tools Agent",
        description: "Helps developers find SDKs, APIs, and integrations.",
        endpoint: "https://xpersona.co/agent/example-devtools",
        domain: "developer-tools",
        protocols: ["openclaw"],
        capabilities: ["api-discovery", "docs", "integration-guides"],
        verified: false,
      },
    ],
  };

  if (!hasSearchQuery && !hasProtocolFilter && !hasBrowse && !hasSearchState) {
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(capabilityMetadata) }}
        />
        <GoogleStyleHome
          isAuthenticated={isAuthenticated}
          privacyUrl="/privacy-policy-1"
          termsUrl="/terms-of-service"
        />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ANSMinimalHeader isAuthenticated={isAuthenticated} variant="dark" />
      <div className="flex-1">
        <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-[var(--text-tertiary)]">Loading search...</div>}>
          <SearchLanding />
        </Suspense>
      </div>
      <ANSMinimalFooter variant="dark" />
    </div>
  );
}
