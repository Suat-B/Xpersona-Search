import { API_DISCOVERY_AD_ID, getAllAds, type AdEntry } from "@/lib/ads/ad-inventory";
import { getGamCreativeCacheTtlMs } from "@/lib/ads/gam-config";

/**
 * Text representation of GAM (or house) creatives for LLM crawlers.
 * Populated from GAM_BOT_CREATIVES_JSON, admin sync, or AdEntry fallback.
 */
export type GamBotCreative = {
  id: string;
  slotKey: string;
  headline: string;
  description: string;
  clickUrl: string;
  advertiserName: string;
};

type CacheEntry = {
  creatives: GamBotCreative[];
  expiresAt: number;
  source: "payload" | "env" | "inventory";
};

let cache: CacheEntry | null = null;

function adEntryToCreative(ad: AdEntry): GamBotCreative {
  const desc = ad.textContent?.trim() || ad.description;
  return {
    id: `inv-${ad.id}`,
    slotKey: "inventory_fallback",
    headline: ad.sponsor,
    description: desc,
    clickUrl: ad.clickUrl,
    advertiserName: ad.sponsor,
  };
}

function inventoryFallbackCreatives(): GamBotCreative[] {
  return getAllAds()
    .filter((a) => a.enabled !== false && a.id !== API_DISCOVERY_AD_ID && a.weight > 0)
    .slice(0, 6)
    .map((ad) => adEntryToCreative(ad));
}

function parseEnvCreatives(): GamBotCreative[] {
  const raw = process.env.GAM_BOT_CREATIVES_JSON?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: GamBotCreative[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i] as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : `env-${i}`;
      const headline = typeof row.headline === "string" ? row.headline : "";
      const description = typeof row.description === "string" ? row.description : "";
      const clickUrl = typeof row.clickUrl === "string" ? row.clickUrl : "";
      const advertiserName =
        typeof row.advertiserName === "string" ? row.advertiserName : headline || "Sponsor";
      const slotKey = typeof row.slotKey === "string" ? row.slotKey : "synced";
      if (!clickUrl || (!headline && !description)) continue;
      out.push({ id, slotKey, headline, description, clickUrl, advertiserName });
    }
    return out;
  } catch {
    return [];
  }
}

function validateCreative(c: GamBotCreative): boolean {
  return (
    Boolean(c.id?.trim()) &&
    Boolean(c.clickUrl?.trim()) &&
    (Boolean(c.headline?.trim()) || Boolean(c.description?.trim()))
  );
}

/**
 * Replace cache from an explicit payload (e.g. POST /api/v1/ad/gam-sync).
 */
export function setGamBotCreativesPayload(creatives: GamBotCreative[]): void {
  const ttl = getGamCreativeCacheTtlMs();
  const cleaned = creatives.filter(validateCreative);
  cache = {
    creatives: cleaned.length > 0 ? cleaned : inventoryFallbackCreatives(),
    expiresAt: Date.now() + ttl,
    source: "payload",
  };
}

/**
 * Reload from process.env.GAM_BOT_CREATIVES_JSON, then fall back to inventory.
 */
export function refreshGamCreativeCacheFromEnv(): void {
  const ttl = getGamCreativeCacheTtlMs();
  const fromEnv = parseEnvCreatives();
  if (fromEnv.length > 0) {
    cache = { creatives: fromEnv, expiresAt: Date.now() + ttl, source: "env" };
    return;
  }
  cache = {
    creatives: inventoryFallbackCreatives(),
    expiresAt: Date.now() + ttl,
    source: "inventory",
  };
}

/**
 * Current cached creatives (refreshes when TTL expired).
 */
export function getGamBotCreatives(): GamBotCreative[] {
  const ttl = getGamCreativeCacheTtlMs();
  if (cache && Date.now() < cache.expiresAt && cache.creatives.length > 0) {
    return cache.creatives;
  }
  refreshGamCreativeCacheFromEnv();
  return cache?.creatives ?? inventoryFallbackCreatives();
}

export function getGamBotCreativeById(id: string): GamBotCreative | undefined {
  return getGamBotCreatives().find((c) => c.id === id);
}

export function getGamCreativeCacheMeta(): {
  expiresAt: number | null;
  source: CacheEntry["source"] | null;
  count: number;
} {
  return {
    expiresAt: cache?.expiresAt ?? null,
    source: cache?.source ?? null,
    count: cache?.creatives.length ?? 0,
  };
}
