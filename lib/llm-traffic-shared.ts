import { classifyBotPageType, isAgentCollectionPath, parseAgentDetailSlugFromPath } from "@/lib/agents/route-patterns";

const SESSION_ID_MAX = 128;

export const LLM_REF_COOKIE_NAME = "xp_llm_ref";
export const INTERNAL_LLM_TRAFFIC_HEADER = "x-internal-llm-traffic";

export type LlmTrafficEventType = "crawler_hit" | "llm_referral" | "llm_conversion";

export function classifyLlmPageType(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname === "/docs" || pathname.startsWith("/docs/")) return "docs";
  if (pathname === "/api" || pathname.startsWith("/api/")) return "api";
  if (pathname === "/for-agents") return "machine_onboarding";
  if (pathname === "/llms.txt" || pathname === "/llms-full.txt" || pathname === "/chatgpt.txt") {
    return "machine_manifest";
  }
  if (pathname === "/sitemap.xml" || pathname.startsWith("/sitemaps/")) return "sitemap";
  if (pathname.startsWith("/api/v1/feeds/agents/")) return "agent_feed";
  if (parseAgentDetailSlugFromPath(pathname)) return "agent_profile";
  if (isAgentCollectionPath(pathname)) return "agent_collection";
  return classifyBotPageType(pathname);
}

export function normalizeReferrerHost(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getLlmReferrerSource(input: {
  referer: string | null | undefined;
  utmSource: string | null | undefined;
}): string | null {
  const utm = (input.utmSource ?? "").trim().toLowerCase();
  if (utm === "chatgpt.com" || utm === "chatgpt") return "chatgpt";
  if (utm === "perplexity.ai" || utm === "perplexity") return "perplexity";
  if (utm === "claude.ai" || utm === "claude") return "claude";

  const host = normalizeReferrerHost(input.referer);
  if (!host) return null;
  if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com") return "chatgpt";
  if (host === "perplexity.ai" || host.endsWith(".perplexity.ai")) return "perplexity";
  if (host === "claude.ai" || host.endsWith(".claude.ai")) return "claude";
  if (host === "copilot.microsoft.com") return "copilot";
  if (host === "gemini.google.com") return "gemini";
  return null;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

export function createLlmReferralSession(source: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return truncate(`${source}.${Date.now().toString(36)}.${random}`, SESSION_ID_MAX);
}

export function parseLlmReferralSession(raw: string | null | undefined): { source: string; sessionId: string } | null {
  if (!raw) return null;
  const [source] = raw.split(".", 1);
  if (!source) return null;
  return {
    source,
    sessionId: truncate(raw, SESSION_ID_MAX),
  };
}

export function getConversionType(pathname: string): string | null {
  if (pathname === "/auth/signup") return "signup";
  if (pathname === "/auth/signin") return "signin";
  if (pathname === "/dashboard/claimed-agents") return "claimed_agents_dashboard";
  if (pathname === "/api/v1/crawl-license") return "crawl_license";
  if (/^\/agent\/[^/]+\/claim$/.test(pathname)) return "agent_claim";
  return null;
}
