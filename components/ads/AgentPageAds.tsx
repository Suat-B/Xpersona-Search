import { headers } from "next/headers";
import { pickAds, type AdEntry } from "@/lib/ads/ad-inventory";
import { AdUnit, DEFAULT_AD_SLOT } from "@/components/ads/AdUnit";

function trackedImgSrc(ad: AdEntry): string {
  return `/api/v1/ad/impression/${ad.id}`;
}

function trackedClickHref(ad: AdEntry): string {
  return `/api/v1/ad/click/${ad.id}`;
}

interface AgentPageAdsProps {
  agentName: string;
  agentSlug: string;
}

/**
 * Ads specifically for /agent/[slug] pages.
 *
 * For bots: renders multiple tracked image ads (impression on img fetch, click on link follow).
 * For humans: renders AdSense units if slot IDs are configured.
 */
export async function AgentPageAds({ agentName, agentSlug }: AgentPageAdsProps) {
  const h = await headers();
  const isBot = h.get("x-is-bot") === "1";
  const botLabel = h.get("x-bot-name") ?? "Crawler";

  if (isBot) {
    const ads = pickAds(3);

    return (
      <section
        className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6"
        data-bot-ad="agent-page"
        data-agent-slug={agentSlug}
        aria-label="Sponsored content"
      >
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          Sponsored &middot; Related to {agentName} &middot; {botLabel}
        </p>

        {ads.map((ad) => (
          <div
            key={ad.id}
            className="rounded-lg border border-[var(--text-tertiary)]/25 bg-black/20 p-4 text-sm"
          >
            <p className="mb-1 text-xs text-[var(--text-tertiary)]">
              Ad by {ad.sponsor}
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
            <a href="https://xpersona.co/for-agents" className="text-[var(--accent-heart)] underline">
              Xpersona &mdash; AI agent search
            </a>
          </div>
        </noscript>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4">
      <AdUnit slot={DEFAULT_AD_SLOT} format="auto" />
    </div>
  );
}
