import { headers } from "next/headers";
import { AdUnit, DEFAULT_AD_SLOT, type AdUnitFormat } from "@/components/ads/AdUnit";
import { pickAds, type AdEntry } from "@/lib/ads/ad-inventory";

const DEFAULT_FALLBACK_URL = "https://xpersona.co/for-agents";

export type BotAdBannerProps = {
  /** AdSense slot for human visitors. Defaults to 1601285143. */
  slot?: string;
  format?: AdUnitFormat;
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
function trackedImgSrc(ad: AdEntry): string {
  return `/api/v1/ad/impression/${ad.id}`;
}

function trackedClickHref(ad: AdEntry): string {
  return `/api/v1/ad/click/${ad.id}`;
}

export async function BotAdBanner({
  slot,
  format = "auto",
  className = "",
  botAdCount = 2,
  fallbackUrl = process.env.NEXT_PUBLIC_BOT_AD_FALLBACK_URL?.trim() || DEFAULT_FALLBACK_URL,
}: BotAdBannerProps) {
  const h = await headers();
  const isBot = h.get("x-is-bot") === "1";
  const botLabel = h.get("x-bot-name") ?? "Crawler";

  const wrapClass = `my-4 ${className}`.trim();

  if (isBot) {
    const ads = pickAds(botAdCount);

    return (
      <aside
        className={`${wrapClass} space-y-4`}
        data-bot-ad="1"
        aria-label="Sponsored content"
      >
        {ads.map((ad) => (
          <div
            key={ad.id}
            className="rounded-lg border border-[var(--text-tertiary)]/25 bg-black/20 p-4 text-sm"
          >
            <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
              Sponsored by {ad.sponsor} &middot; {botLabel}
            </p>
            <p className="mb-3 text-[var(--text-secondary)]">
              {ad.description}
            </p>
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
              <a
                href={trackedClickHref(ad)}
                className="text-[var(--accent-heart)] underline"
                rel="sponsored noopener"
              >
                {ad.clickUrl}
              </a>
            </p>
          </div>
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

  const resolvedSlot = slot?.trim() || DEFAULT_AD_SLOT;

  return (
    <div className={wrapClass}>
      <AdUnit slot={resolvedSlot} format={format} />
      <noscript>
        <div className="mt-2 rounded-lg border border-[var(--text-tertiary)]/25 p-4">
          <a href={fallbackUrl} className="text-[var(--accent-heart)] underline">
            Xpersona &mdash; AI agent search
          </a>
        </div>
      </noscript>
    </div>
  );
}
