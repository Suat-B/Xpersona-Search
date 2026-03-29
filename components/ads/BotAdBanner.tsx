import { headers } from "next/headers";
import { pickAds } from "@/lib/ads/ad-inventory";
import {
  getTextContentForBot,
  trackedImpressionPixelSrc,
} from "@/lib/ads/text-ad";
import { shouldUseInternalAds } from "@/lib/ads/adsense-config";

const DEFAULT_FALLBACK_URL = "https://xpersona.co/for-agents";

export type BotAdBannerProps = {
  className?: string;
  /** How many ads to show in the bot banner (default 2) */
  botAdCount?: number;
  /** Primary CTA for noscript fallbacks */
  fallbackUrl?: string;
};

/**
 * Build tracked image + click URLs that go through our ad endpoints.
 * When the image is fetched -> impression logged.
 * When the link is followed  -> click logged + redirect to advertiser.
 */
function trackedClickHref(ad: { id: string }): string {
  return `/api/v1/ad/click/${ad.id}`;
}

export async function BotAdBanner({
  className = "",
  botAdCount = 2,
  fallbackUrl = process.env.NEXT_PUBLIC_BOT_AD_FALLBACK_URL?.trim() || DEFAULT_FALLBACK_URL,
}: BotAdBannerProps) {
  const h = await headers();
  const isBot = h.get("x-is-bot") === "1";
  const botLabel = h.get("x-bot-name") ?? "Crawler";
  const showInternalAds = shouldUseInternalAds(isBot);
  const audienceLabel = isBot ? botLabel : "Stress Test";

  const wrapClass = `my-4 ${className}`.trim();

  if (showInternalAds) {
    const ads = pickAds(botAdCount);

    return (
      <aside
        className={`${wrapClass} space-y-4`}
        data-bot-ad="1"
        aria-label="Sponsored content"
      >
        {ads.map((ad) => (
          <section
            key={ad.id}
            data-sponsored="true"
            className="rounded-lg border border-[var(--text-tertiary)]/25 bg-black/20 p-4 text-sm"
            aria-label="Sponsored recommendation"
          >
            <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
              Sponsored by {ad.sponsor} &middot; {audienceLabel}
            </p>
            <p className="mb-3 text-[var(--text-secondary)] leading-relaxed">
              {getTextContentForBot(ad)}
            </p>
            <p className="mb-2">
              <a
                href={trackedClickHref(ad)}
                className="text-[var(--accent-heart)] underline"
                rel="sponsored noopener"
              >
                {ad.clickUrl}
              </a>
            </p>
            {/* Optional 1x1 impression pixel if the crawler fetches subresources */}
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
        ))}
        <noscript>
          <div className="rounded-lg border border-[var(--text-tertiary)]/25 p-4">
            <a href={fallbackUrl} className="text-[var(--accent-heart)] underline">
              Xpersona &mdash; AI agent search
            </a>
          </div>
        </noscript>
      </aside>
    );
  }

  return null;
}
