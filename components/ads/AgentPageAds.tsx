import { headers } from "next/headers";
import {
  buildAgentGamTargeting,
  getConfiguredAgentSlots,
  isGamEnabledForAgentPages,
} from "@/lib/ads/gam-config";
import { getAgentPageGamBotItems } from "@/lib/ads/gam-bot-renderer";
import { AgentPageGAMAds } from "@/components/ads/AgentPageGAMAds";
import { HumanAdSection } from "@/components/ads/HumanAdSection";
import { shouldUseInternalAds } from "@/lib/ads/adsense-config";

interface AgentPageAdsProps {
  agentName: string;
  agentSlug: string;
  /** Used for GAM key-value targeting (e.g. dossier source). */
  agentCategory?: string;
}

/**
 * Ads for /agent/[slug]: humans get AdSense by default; GAM is opt-in via env.
 * Human visitors now rely on AdSense Auto Ads globally; only GAM keeps
 * explicit placements on agent pages.
 */
export async function AgentPageAds({
  agentName,
  agentSlug,
  agentCategory,
}: AgentPageAdsProps) {
  const h = await headers();
  const isBot = h.get("x-is-bot") === "1";
  const botLabel = h.get("x-bot-name") ?? "Crawler";
  const showInternalAds = shouldUseInternalAds(isBot);
  const audienceLabel = isBot ? botLabel : "Stress Test";

  if (showInternalAds) {
    const items = getAgentPageGamBotItems(agentSlug, 3);

    return (
      <section
        className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6"
        data-bot-ad="agent-page"
        data-agent-slug={agentSlug}
        aria-label="Sponsored content"
      >
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          Sponsored &middot; Related to {agentName} &middot; {audienceLabel}
        </p>

        {items.map((item) => (
          <section
            key={item.id}
            data-sponsored="true"
            data-gam-bot-creative={item.id}
            className="rounded-lg border border-[var(--text-tertiary)]/25 bg-black/20 p-4 text-sm"
            aria-label="Sponsored recommendation"
          >
            <p className="mb-1 text-xs text-[var(--text-tertiary)]">
              Sponsored &middot; {item.advertiserName} &middot; {item.slotKey}
            </p>
            {item.headline ? (
              <p className="mb-2 font-medium text-[var(--text-primary)]">{item.headline}</p>
            ) : null}
            <p className="mb-3 text-[var(--text-secondary)] leading-relaxed">
              {item.description.trim() || item.headline}
            </p>
            <p className="mb-2">
              <a
                href={item.trackedClickPath}
                className="text-[var(--accent-heart)] underline"
                rel="sponsored noopener"
              >
                {item.clickUrl}
              </a>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.impressionBeaconSrc}
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
            <a href="https://xpersona.co/for-agents" className="text-[var(--accent-heart)] underline">
              Xpersona &mdash; AI agent search
            </a>
          </div>
        </noscript>
      </section>
    );
  }

  if (isGamEnabledForAgentPages()) {
    const slots = getConfiguredAgentSlots();
    const targeting = buildAgentGamTargeting({
      agentSlug,
      agentName,
      agentCategory,
    });
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4">
        <AgentPageGAMAds slots={slots} targeting={targeting} key={agentSlug} />
      </div>
    );
  }

  return (
    <HumanAdSection
      className="py-6"
      title="Sponsored"
      description={`Ads related to ${agentName} and adjacent AI workflows.`}
    />
  );
}
