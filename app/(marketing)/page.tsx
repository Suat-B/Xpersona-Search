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

  if (!hasSearchQuery && !hasProtocolFilter && !hasBrowse && !hasSearchState) {
    return (
      <GoogleStyleHome
        isAuthenticated={isAuthenticated}
        privacyUrl="/privacy-policy-1"
        termsUrl="/terms-of-service"
      />
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
