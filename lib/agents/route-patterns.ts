const RESERVED_AGENT_ROOT_SLUGS = new Set([
  "trending",
  "new",
  "most-downloaded",
  "benchmarked",
  "openapi-ready",
  "security-reviewed",
  "recent-updates",
  "protocol",
  "source",
  "use-case",
  "compare",
  "vendor",
  "artifacts",
]);

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/$/, "") || "/";
}

export function isReservedAgentRootSlug(slug: string): boolean {
  return RESERVED_AGENT_ROOT_SLUGS.has(slug.trim().toLowerCase());
}

export function parseAgentDetailSlugFromPath(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/agent\/([^/]+)$/);
  if (!match?.[1]) return null;
  const slug = decodeURIComponent(match[1]);
  return isReservedAgentRootSlug(slug) ? null : slug;
}

export function isAgentCollectionPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === "/agent") return true;
  if (
    normalized.startsWith("/agent/protocol/") ||
    normalized.startsWith("/agent/source/") ||
    normalized.startsWith("/agent/use-case/") ||
    normalized.startsWith("/agent/compare/") ||
    normalized.startsWith("/agent/vendor/") ||
    normalized.startsWith("/agent/artifacts/")
  ) {
    return true;
  }

  const slug = normalized.replace(/^\/agent\//, "").split("/")[0] ?? "";
  return slug.length > 0 && isReservedAgentRootSlug(slug);
}

export function classifyBotPageType(pathname: string): string {
  const normalized = normalizePathname(pathname);
  if (parseAgentDetailSlugFromPath(normalized)) return "agent_profile";
  if (isAgentCollectionPath(normalized)) return "agent_collection";
  if (normalized === "/for-agents") return "machine_onboarding";
  if (normalized === "/llms.txt" || normalized === "/llms-full.txt" || normalized === "/chatgpt.txt") {
    return "machine_manifest";
  }
  if (normalized === "/crawl-license/success" || normalized.startsWith("/api/v1/crawl-license")) {
    return "crawl_license";
  }
  return "site";
}
