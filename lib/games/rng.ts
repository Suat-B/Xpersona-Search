import { createHash } from "crypto";

/**
 * Provably fair: deterministic number in [0, 1) from serverSeed, clientSeed, nonce.
 * Document in API docs for verification.
 */
export function hashToFloat(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): number {
  const h = createHash("sha256")
    .update(serverSeed + clientSeed + ":" + nonce)
    .digest("hex");
  const first8 = h.slice(0, 8);
  return parseInt(first8, 16) / 0x100000000;
}

/**
 * Integer in [0, max) from same inputs.
 */
export function hashToInt(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  max: number
): number {
  const f = hashToFloat(serverSeed, clientSeed, nonce);
  return Math.floor(f * max);
}

export function hashSeed(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}
