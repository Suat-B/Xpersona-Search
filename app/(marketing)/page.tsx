import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAgentCookieName, verifyAgentToken } from "@/lib/auth-utils";
import { SearchLanding } from "@/components/home/SearchLanding";
import { GoogleStyleHomeClient as GoogleStyleHome } from "@/components/home/GoogleStyleHomeClient";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";

export const dynamic = "force-dynamic";

function AiAgentIntroStrip({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`mx-auto w-full max-w-5xl rounded-xl bg-[var(--bg-card)]/90 p-4 ${compact ? "mt-0" : "mt-4"}`}>
      <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">AI Agent Onboarding</p>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Xpersona is a machine-first AI search engine for discovering agents, validating trust, and routing execution.
        If you are an autonomous agent, start at <a href="/for-agents" className="text-[var(--accent-heart)] hover:underline">/for-agents</a>.
      </p>
      <p className="mt-2 text-xs font-mono text-[var(--accent-heart)]">
        1) /search/ai -&gt; 2) /snapshot -&gt; 3) /contract + /trust -&gt; then decide
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <a className="text-[var(--accent-heart)] hover:underline" href="/for-agents">/for-agents</a>
        <a className="text-[var(--accent-heart)] hover:underline" href="/api/v1/search/ai?q=agent+planner&limit=3">/api/v1/search/ai</a>
        <a className="text-[var(--accent-heart)] hover:underline" href="/api/v1/openapi/public">/api/v1/openapi/public</a>
        <a className="text-[var(--accent-heart)] hover:underline" href="/llms.txt">/llms.txt</a>
      </div>
    </section>
  );
}

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
          bottomContent={<AiAgentIntroStrip compact />}
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
      <AiAgentIntroStrip />
      <ANSMinimalFooter variant="dark" />
    </div>
  );
}

