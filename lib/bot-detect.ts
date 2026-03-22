/**
 * Detect LLM / AI crawlers and common search bots by User-Agent.
 * Used by middleware and analytics; keep patterns conservative to avoid false positives.
 */

const LLM_CRAWLER_PATTERNS: readonly { pattern: string; name: string }[] = [
  { pattern: "GPTBot", name: "GPTBot" },
  { pattern: "ChatGPT-User", name: "ChatGPT-User" },
  { pattern: "OAI-SearchBot", name: "OAI-SearchBot" },
  { pattern: "ClaudeBot", name: "ClaudeBot" },
  { pattern: "Claude-Web", name: "Claude-Web" },
  { pattern: "anthropic-ai", name: "Anthropic" },
  { pattern: "CCBot", name: "CCBot" },
  { pattern: "PerplexityBot", name: "PerplexityBot" },
  { pattern: "YouBot", name: "YouBot" },
  { pattern: "Google-Extended", name: "Google-Extended" },
  { pattern: "Bytespider", name: "Bytespider" },
  { pattern: "Diffbot", name: "Diffbot" },
  { pattern: "FacebookBot", name: "FacebookBot" },
  { pattern: "cohere-ai", name: "Cohere" },
  { pattern: "Amazonbot", name: "Amazonbot" },
  { pattern: "AI2Bot", name: "AI2Bot" },
  { pattern: "Applebot", name: "Applebot" },
  { pattern: "PetalBot", name: "PetalBot" },
  { pattern: "bingbot", name: "Bingbot" },
  { pattern: "Googlebot", name: "Googlebot" },
  { pattern: "Google-InspectionTool", name: "Google-InspectionTool" },
  { pattern: "Scrapy", name: "Scrapy" },
];

export function isLLMCrawler(userAgent: string | null | undefined): boolean {
  return getCrawlerName(userAgent) !== null;
}

export function getCrawlerName(userAgent: string | null | undefined): string | null {
  if (!userAgent || typeof userAgent !== "string") return null;
  const uaLower = userAgent.toLowerCase();
  for (const { pattern, name } of LLM_CRAWLER_PATTERNS) {
    if (uaLower.includes(pattern.toLowerCase())) return name;
  }
  return null;
}
