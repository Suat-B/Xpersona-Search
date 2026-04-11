import { AdUnit } from "@/components/ads/AdUnit";
import { ADSENSE_DEFAULT_SLOT, getAdSenseClientId } from "@/lib/ads/adsense-config";

type HumanAdSectionProps = {
  className?: string;
  title?: string;
  description?: string;
  adSlot?: string;
};

export function HumanAdSection({
  className = "",
  title = "Sponsored",
  description,
  adSlot = ADSENSE_DEFAULT_SLOT,
}: HumanAdSectionProps) {
  if (!getAdSenseClientId().trim() || !adSlot.trim()) return null;

  return (
    <section
      className={`mx-auto w-full max-w-7xl px-4 ${className}`.trim()}
      aria-label="Sponsored content"
    >
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-card)]/80 p-3 sm:p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          {title}
        </p>
        {description ? (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {description}
          </p>
        ) : null}
        <AdUnit
          slot={adSlot}
          className="mt-3"
          style={{ minHeight: 90 }}
        />
      </div>
    </section>
  );
}
