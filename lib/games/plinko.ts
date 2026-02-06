import { PLINKO_ROWS } from "@/lib/constants";
import { hashToFloat } from "./rng";

export type PlinkoRisk = "low" | "medium" | "high";

/** Bucket index 0 = far left, 12 = far right. 13 buckets for 12 rows. */
const BUCKET_COUNT = PLINKO_ROWS + 1;

/** Low risk: center pays most; edges lower. */
const LOW_MULTIPLIERS: number[] = [
  0.5, 1, 1.5, 2, 2.5, 5, 10, 5, 2.5, 2, 1.5, 1, 0.5,
];

/** Medium risk: more variance. */
const MEDIUM_MULTIPLIERS: number[] = [
  0.2, 0.5, 1, 2, 4, 8, 16, 8, 4, 2, 1, 0.5, 0.2,
];

/** High risk: extreme edges. */
const HIGH_MULTIPLIERS: number[] = [
  0.1, 0.3, 1, 2, 5, 15, 50, 15, 5, 2, 1, 0.3, 0.1,
];

function getMultipliers(risk: PlinkoRisk): number[] {
  switch (risk) {
    case "low":
      return LOW_MULTIPLIERS;
    case "medium":
      return MEDIUM_MULTIPLIERS;
    case "high":
      return HIGH_MULTIPLIERS;
    default:
      return LOW_MULTIPLIERS;
  }
}

/**
 * Path: 12 steps, each step L (0) or R (1). Bit i from hash(serverSeed, clientSeed, nonce+i).
 * Bucket = number of R's in path (0..12).
 */
export function plinkoPath(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): { path: ("L" | "R")[]; bucketIndex: number } {
  const path: ("L" | "R")[] = [];
  let rCount = 0;
  for (let i = 0; i < PLINKO_ROWS; i++) {
    const f = hashToFloat(serverSeed, clientSeed, nonce + i);
    const goRight = f >= 0.5;
    path.push(goRight ? "R" : "L");
    if (goRight) rCount++;
  }
  return { path, bucketIndex: rCount };
}

export function runPlinkoBet(
  amount: number,
  risk: PlinkoRisk,
  serverSeed: string,
  clientSeed: string,
  nonce: number
): {
  path: ("L" | "R")[];
  bucketIndex: number;
  multiplier: number;
  payout: number;
  resultPayload: { path: ("L" | "R")[]; bucketIndex: number; multiplier: number; risk: PlinkoRisk };
} {
  const multipliers = getMultipliers(risk);
  const { path, bucketIndex } = plinkoPath(serverSeed, clientSeed, nonce);
  const multiplier = multipliers[bucketIndex] ?? 0;
  const payout = Math.round(amount * multiplier);
  return {
    path,
    bucketIndex,
    multiplier,
    payout,
    resultPayload: { path, bucketIndex, multiplier, risk },
  };
}
