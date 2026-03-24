import { headers } from "next/headers";
import { pickAd } from "@/lib/ads/ad-inventory";
import {
  getTextContentForBot,
  trackedImpressionPixelSrc,
} from "@/lib/ads/text-ad";
import { AdUnit, DEFAULT_AD_SLOT } from "@/components/ads/AdUnit";
import { shouldUseInternalAds } from "@/lib/ads/adsense-config";

function trackedClickHref(ad: { id: string }): string {
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
  const showInternalAds = shouldUseInternalAds(isBot);
  const audienceLabel = isBot ? botLabel : "Stress Test";

  if (showInternalAds) {
    const ad = pickAd();
    if (!ad) return null;

    return (
      <section
        data-sponsored="true"
        className={`rounded-lg border border-[var(--text-tertiary)]/25 bg-black/20 p-4 text-sm ${className}`.trim()}
        data-bot-ad="inline"
        data-ad-position={position}
        aria-label="Sponsored recommendation"
      >
        <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          Sponsored by {ad.sponsor} &middot; {audienceLabel}
        </p>
        <p className="mb-2 text-[var(--text-secondary)] leading-relaxed">
          {getTextContentForBot(ad)}
        </p>
        <p className="mb-2">
          <a href={trackedClickHref(ad)} className="text-[var(--accent-heart)] underline" rel="sponsored noopener">
            {ad.clickUrl}
          </a>
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={trackedImpressionPixelSrc(ad)}
          alt=""
          width={1}
          height={1}
          className="pointer-events-none h-px w-px opacity-0"
          loading="eager"
        />
      </section>
    );
  }

  const resolvedSlot = slot?.trim() || DEFAULT_AD_SLOT;

  return (
    <div className={className}>
      <AdUnit slot={resolvedSlot} format="auto" />
    </div>
  );
}
