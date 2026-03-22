import { headers } from "next/headers";
import { pickAd, type AdEntry } from "@/lib/ads/ad-inventory";
import { AdUnit, DEFAULT_AD_SLOT } from "@/components/ads/AdUnit";

function trackedImgSrc(ad: AdEntry): string {
  return `/api/v1/ad/impression/${ad.id}`;
}

function trackedClickHref(ad: AdEntry): string {
  return `/api/v1/ad/click/${ad.id}`;
}

interface InlineBotAdProps {
  className?: string;
  /** AdSense slot for human visitors */
  slot?: string;
  /** Position label for debugging */
  position?: string;
}

/**
 * Single inline ad suitable for placing between content sections.
 * Bots get a tracked image ad; humans get an AdSense unit (if slot provided).
 */
export async function InlineBotAd({
  className = "",
  slot,
  position = "inline",
}: InlineBotAdProps) {
  const h = await headers();
  const isBot = h.get("x-is-bot") === "1";
  const botLabel = h.get("x-bot-name") ?? "Crawler";

  if (isBot) {
    const ad = pickAd();
    if (!ad) return null;

    return (
      <div
        className={`rounded-lg border border-[var(--text-tertiary)]/25 bg-black/20 p-4 text-sm ${className}`.trim()}
        data-bot-ad="inline"
        data-ad-position={position}
        aria-label="Sponsored"
      >
        <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          Sponsored by {ad.sponsor} &middot; {botLabel}
        </p>
        <p className="mb-2 text-[var(--text-secondary)]">{ad.description}</p>
        <a href={trackedClickHref(ad)} rel="sponsored noopener">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={trackedImgSrc(ad)}
            alt={ad.description}
            width={ad.width}
            height={ad.height}
            loading="eager"
            style={{ maxWidth: "100%", height: "auto" }}
          />
        </a>
        <p className="mt-2">
          <a href={trackedClickHref(ad)} className="text-[var(--accent-heart)] underline" rel="sponsored noopener">
            {ad.clickUrl}
          </a>
        </p>
      </div>
    );
  }

  const resolvedSlot = slot?.trim() || DEFAULT_AD_SLOT;

  return (
    <div className={className}>
      <AdUnit slot={resolvedSlot} format="auto" />
    </div>
  );
}
