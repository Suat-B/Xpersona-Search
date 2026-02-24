import crypto from "crypto";

export type TrustReceiptKey = { keyId: string; secret: string };

type ReceiptKeyMap = Map<string, string>;

function parseReceiptKeys(raw: string | undefined): ReceiptKeyMap {
  const map: ReceiptKeyMap = new Map();
  if (!raw) return map;
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [keyId, ...rest] = trimmed.split(":");
    const secret = rest.join(":");
    if (!keyId || !secret) continue;
    map.set(keyId, secret);
  }
  return map;
}

export function getReceiptKeyMap(): ReceiptKeyMap {
  return parseReceiptKeys(process.env.TRUST_RECEIPT_KEYS);
}

export function getActiveReceiptKeyId(): string | null {
  const explicit = process.env.TRUST_RECEIPT_ACTIVE_KEY_ID?.trim();
  if (explicit) return explicit;
  const map = getReceiptKeyMap();
  return map.keys().next().value ?? null;
}

export function canonicalizePayload(payload: unknown): string {
  return stableStringify(payload);
}

export function hashPayload(canonicalPayload: string): string {
  return crypto.createHash("sha256").update(canonicalPayload).digest("hex");
}

export function signPayloadHash(payloadHash: string, keyId: string): string {
  const map = getReceiptKeyMap();
  const secret = map.get(keyId);
  if (!secret) throw new Error(`Unknown receipt key: ${keyId}`);
  return crypto.createHmac("sha256", secret).update(payloadHash).digest("hex");
}

export function verifyReceiptSignature(params: {
  payload: unknown;
  payloadHash: string;
  signature: string;
  keyId: string;
}): boolean {
  const map = getReceiptKeyMap();
  const secret = map.get(params.keyId);
  if (!secret) return false;
  const canonical = canonicalizePayload(params.payload);
  const computedHash = hashPayload(canonical);
  if (computedHash !== params.payloadHash) return false;
  const expected = crypto.createHmac("sha256", secret).update(computedHash).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(params.signature, "utf8")
    );
  } catch {
    return false;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const props = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`);
  return `{${props.join(",")}}`;
}
