/**
 * Server-side ad inventory for bot/noscript traffic.
 *
 * Each ad has an image, a click-through URL, and a weight (higher = shown more).
 * Impressions are tracked when the image is fetched via /api/v1/ad/impression/[id].
 * Clicks are tracked when the link is followed via /api/v1/ad/click/[id].
 *
 * To add real sponsors: insert entries here with their creative image URL and
 * destination.  For now the inventory is seeded with self-promo placements.
 */

export interface AdEntry {
  id: string;
  /** Sponsor / advertiser label shown above the creative */
  sponsor: string;
  /** Short description (rendered as text for crawlers) */
  description: string;
  /** Absolute URL to the creative image (can be local like /ads/banner-1.png) */
  imageUrl: string;
  /** Width of the creative in px */
  width: number;
  /** Height of the creative in px */
  height: number;
  /** Where clicks go */
  clickUrl: string;
  /** Relative weight for random selection (higher = more likely) */
  weight: number;
  /** Optional: disable without removing */
  enabled?: boolean;
}

/**
 * Static inventory. Replace / extend with DB-backed ads later.
 * Image URLs starting with "/" are served from `public/`.
 */
const ADS: AdEntry[] = [
  {
    id: "xp-agents-1",
    sponsor: "Xpersona",
    description:
      "Discover 100,000+ AI agents — search, verify trust, and route with Xpersona.",
    imageUrl: "/ads/xpersona-banner-1.svg",
    width: 728,
    height: 90,
    clickUrl: "https://xpersona.co/for-agents",
    weight: 10,
    enabled: true,
  },
  {
    id: "xp-search-2",
    sponsor: "Xpersona Search",
    description:
      "AI-native search engine for agents — snapshots, contracts, and trust signals in one query.",
    imageUrl: "/ads/xpersona-banner-2.svg",
    width: 728,
    height: 90,
    clickUrl: "https://xpersona.co/search",
    weight: 10,
    enabled: true,
  },
  {
    id: "xp-playground-3",
    sponsor: "Xpersona Playground",
    description:
      "Run and test AI agents in the browser — no setup required.",
    imageUrl: "/ads/xpersona-banner-3.svg",
    width: 300,
    height: 250,
    clickUrl: "https://xpersona.co/playground",
    weight: 5,
    enabled: true,
  },
];

function enabledAds(): AdEntry[] {
  return ADS.filter((a) => a.enabled !== false);
}

/** Weighted random pick from enabled ads. */
export function pickAd(): AdEntry | null {
  const pool = enabledAds();
  if (pool.length === 0) return null;
  const totalWeight = pool.reduce((sum, a) => sum + a.weight, 0);
  let r = Math.random() * totalWeight;
  for (const ad of pool) {
    r -= ad.weight;
    if (r <= 0) return ad;
  }
  return pool[pool.length - 1]!;
}

/** Pick up to `n` distinct ads. */
export function pickAds(n: number): AdEntry[] {
  const pool = enabledAds();
  if (pool.length === 0) return [];
  if (n >= pool.length) return pool;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function getAdById(id: string): AdEntry | undefined {
  return ADS.find((a) => a.id === id);
}

export function getAllAds(): AdEntry[] {
  return [...ADS];
}
