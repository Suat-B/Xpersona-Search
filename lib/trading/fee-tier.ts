/**
 * Platform fee tiers for marketplace developers.
 * Newcomer: 25% | Established: 20% | Elite: 15% | Platinum: 10%
 */
export type FeeTier = "newcomer" | "established" | "elite" | "platinum";

export function calculatePlatformFeePercent(
  subscriberCount: number,
  rating: number | null,
  isFeatured?: boolean
): number {
  if (subscriberCount >= 2000 && (isFeatured || (rating != null && rating >= 4.5))) return 10;
  if (subscriberCount >= 500 && rating != null && rating >= 4.5) return 15;
  if (subscriberCount >= 50) return 20;
  return 25;
}

export function getFeeTier(
  subscriberCount: number,
  rating: number | null,
  isFeatured?: boolean
): FeeTier {
  if (subscriberCount >= 2000 && (isFeatured || (rating != null && rating >= 4.5))) return "platinum";
  if (subscriberCount >= 500 && rating != null && rating >= 4.5) return "elite";
  if (subscriberCount >= 50) return "established";
  return "newcomer";
}
