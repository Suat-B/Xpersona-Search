"use client";

type Tier = "NONE" | "BRONZE" | "SILVER" | "GOLD";

interface Props {
  tier?: Tier | string | null;
  size?: "sm" | "md";
}

const TIER_STYLE: Record<Exclude<Tier, "NONE">, string> = {
  BRONZE: "border-[#cd7f32]/40 bg-[#cd7f32]/10 text-[#cd7f32]",
  SILVER: "border-[#c0c0c0]/40 bg-[#c0c0c0]/10 text-[#c0c0c0]",
  GOLD: "border-[#ffd700]/40 bg-[#ffd700]/10 text-[#ffd700]",
};

export function VerificationTierBadge({ tier, size = "md" }: Props) {
  const normalized = (tier ?? "NONE").toString().toUpperCase() as Tier;
  if (normalized === "NONE" || !(normalized in TIER_STYLE)) return null;

  const isSm = size === "sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${TIER_STYLE[normalized]} ${
        isSm ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
      title={`Verification tier: ${normalized}`}
    >
      {normalized}
    </span>
  );
}
