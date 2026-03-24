import type { GamBotCreative } from "@/lib/ads/gam-creative-cache";
import { getGamBotCreatives } from "@/lib/ads/gam-creative-cache";

export type AgentPageBotAdItem = GamBotCreative & {
  /** Through-click for analytics + redirect */
  trackedClickPath: string;
  /** Optional impression pixel */
  impressionBeaconSrc: string;
};

/**
 * Build up to `limit` bot-visible “GAM mirror” ad rows for an agent page.
 * Same creatives are used for all agents unless you extend with per-slug JSON later.
 */
export function getAgentPageGamBotItems(
  _agentSlug: string,
  limit = 3
): AgentPageBotAdItem[] {
  const pool = getGamBotCreatives();
  const slice = pool.slice(0, Math.max(1, limit));
  return slice.map((c) => ({
    ...c,
    trackedClickPath: `/api/v1/ad/gam-bot/click/${encodeURIComponent(c.id)}`,
    impressionBeaconSrc: `/api/v1/ad/gam-bot/impression/${encodeURIComponent(c.id)}`,
  }));
}
