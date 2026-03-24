import type { AdEntry } from "@/lib/ads/ad-inventory";

/**
 * Natural-language body for LLM crawlers (text-first monetization).
 * Prefer explicit `textContent` on the entry; otherwise synthesize from description + URL.
 */
export function getTextContentForBot(ad: AdEntry): string {
  if (ad.textContent?.trim()) return ad.textContent.trim();
  const desc = ad.description.trim();
  return `${desc} Learn more: ${ad.clickUrl}`;
}

/** Short context line for APIs / llms.txt (e.g. "when searching for AI agents"). */
export function getSponsorContext(ad: AdEntry): string {
  if (ad.sponsorContext?.trim()) return ad.sponsorContext.trim();
  return `Relevant when considering products or services from ${ad.sponsor}.`;
}

/** 1x1 impression URL for optional subresource fetch (some crawlers fetch images). */
export function trackedImpressionPixelSrc(ad: AdEntry): string {
  return `/api/v1/ad/impression/${ad.id}`;
}
