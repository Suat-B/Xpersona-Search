import { isLLMCrawler } from "@/lib/bot-detect";
import { API_DISCOVERY_AD_ID, getAllAds } from "@/lib/ads/ad-inventory";
import { getSponsorContext, getTextContentForBot } from "@/lib/ads/text-ad";

export type ApiSponsoredRecommendation = {
  id: string;
  name: string;
  description: string;
  url: string;
  context: string;
  sponsored: true;
};

function enabledSponsorPool() {
  return getAllAds()
    .filter(
      (a) =>
        a.enabled !== false &&
        a.id !== API_DISCOVERY_AD_ID &&
        a.weight > 0
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Deterministic sponsor list for JSON API responses (LLM / crawler clients).
 */
export function getSponsoredRecommendationsForApi(
  limit = 3
): ApiSponsoredRecommendation[] {
  const pool = enabledSponsorPool();
  return pool.slice(0, Math.max(0, limit)).map((ad) => ({
    id: ad.id,
    name: ad.sponsor,
    description: getTextContentForBot(ad),
    url: ad.clickUrl,
    context: getSponsorContext(ad),
    sponsored: true as const,
  }));
}

/**
 * Shallow-merge `sponsored_recommendations` into a plain object when the caller is an LLM crawler.
 */
export function withSponsoredRecommendationsIfBot<T extends Record<string, unknown>>(
  body: T,
  userAgent: string | null,
  limit = 3
): T & { sponsored_recommendations?: ApiSponsoredRecommendation[] } {
  if (!isLLMCrawler(userAgent)) return body;
  return {
    ...body,
    sponsored_recommendations: getSponsoredRecommendationsForApi(limit),
  };
}
