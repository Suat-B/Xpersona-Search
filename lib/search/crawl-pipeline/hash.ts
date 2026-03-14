import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function normalizedUrlHash(inputUrl: string): string {
  return sha256Hex(
    inputUrl
      .trim()
      .toLowerCase()
      .replace(/#.*$/, "")
      .replace(/[?&](utm_[^=&]+|fbclid|gclid)=[^&]*/g, "")
      .replace(/\/+$/, "")
  );
}

export function computeContentHash(parts: {
  title?: string | null;
  snippet?: string | null;
  bodyText: string;
}): string {
  const normalizeText = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const normalized = `${normalizeText(parts.title ?? "")}\n${normalizeText(parts.snippet ?? "")}\n${normalizeText(parts.bodyText)}`;
  return sha256Hex(normalized);
}

function tokenHash64(token: string): bigint {
  const hex = sha256Hex(token).slice(0, 16);
  return BigInt(`0x${hex}`);
}

export function simhash64(text: string): string {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return "0000000000000000";

  const weights = new Array<number>(64).fill(0);
  const ONE = BigInt(1);
  const ZERO = BigInt(0);
  for (const token of tokens) {
    const h = tokenHash64(token);
    for (let i = 0; i < 64; i += 1) {
      const bit = (h >> BigInt(i)) & ONE;
      weights[i] += bit === ONE ? 1 : -1;
    }
  }

  let out = ZERO;
  for (let i = 0; i < 64; i += 1) {
    if (weights[i] > 0) out |= ONE << BigInt(i);
  }
  return out.toString(16).padStart(16, "0");
}
