/**
 * In-memory ad impression and click tracker.
 *
 * For production at scale, swap this with a database table or Redis.
 * The in-memory approach works fine for single-instance Vercel deployments
 * and gives instant stats without external deps.
 */

interface AdStats {
  impressions: number;
  clicks: number;
  lastImpression: string | null;
  lastClick: string | null;
}

const store = new Map<string, AdStats>();

function ensure(adId: string): AdStats {
  let s = store.get(adId);
  if (!s) {
    s = { impressions: 0, clicks: 0, lastImpression: null, lastClick: null };
    store.set(adId, s);
  }
  return s;
}

export function recordImpression(adId: string): void {
  const s = ensure(adId);
  s.impressions++;
  s.lastImpression = new Date().toISOString();
}

export function recordClick(adId: string): void {
  const s = ensure(adId);
  s.clicks++;
  s.lastClick = new Date().toISOString();
}

export function getStats(adId: string): AdStats {
  return ensure(adId);
}

export function getAllStats(): Record<string, AdStats> {
  const out: Record<string, AdStats> = {};
  for (const [id, stats] of store.entries()) {
    out[id] = { ...stats };
  }
  return out;
}
