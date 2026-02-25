import { getExecuteBlendWeight } from "@/lib/gpg/risk";

export type GpgSignals = {
  clusterId: string | null;
  pSuccess: number;
  risk: number;
  expectedCost: number;
  expectedLatencyMs: number;
  gpgScore: number;
};

export function blendExecuteScore(legacyScore: number, gpgScore: number | null): number {
  const weight = getExecuteBlendWeight();
  const legacy = Math.max(0, Math.min(1, legacyScore));
  const gpg = gpgScore == null ? legacy : Math.max(0, Math.min(1, gpgScore));
  const blended = legacy * (1 - weight) + gpg * weight;
  return Number(blended.toFixed(4));
}