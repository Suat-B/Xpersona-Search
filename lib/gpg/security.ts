import { createHash } from "crypto";
import { hashPayload } from "./hash";

const DEFAULT_WINDOW_SEC = Number(process.env.GPG_SIGNING_WINDOW_SEC ?? "300");
const MAX_SKEW_SEC = Number(process.env.GPG_SIGNING_MAX_SKEW_SEC ?? "300");

function parseKeys(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
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

export function getGpgKeyMap(): Map<string, string> {
  return parseKeys(process.env.GPG_SIGNING_KEYS);
}

export function getActiveGpgKeyId(): string | null {
  const explicit = process.env.GPG_ACTIVE_SIGNING_KEY_ID?.trim();
  if (explicit) return explicit;
  const map = getGpgKeyMap();
  return map.keys().next().value ?? null;
}

export function buildSignaturePayload(params: {
  payloadHash: string;
  timestamp: string;
  idempotencyKey: string;
}): string {
  return [params.payloadHash, params.timestamp, params.idempotencyKey].join(".");
}

export function signPayload(params: {
  payloadHash: string;
  timestamp: string;
  idempotencyKey: string;
  keyId: string;
}): string {
  const map = getGpgKeyMap();
  const secret = map.get(params.keyId);
  if (!secret) throw new Error("Unknown GPG key id");
  const base = buildSignaturePayload({
    payloadHash: params.payloadHash,
    timestamp: params.timestamp,
    idempotencyKey: params.idempotencyKey,
  });
  return createHash("sha256").update(`${secret}:${base}`).digest("hex");
}

export function verifyPayloadSignature(params: {
  payload: unknown;
  timestamp: string;
  idempotencyKey: string;
  signature: string;
  keyId: string;
}): { ok: boolean; reason?: string } {
  const map = getGpgKeyMap();
  const secret = map.get(params.keyId);
  if (!secret) return { ok: false, reason: "UNKNOWN_KEY" };

  const payloadHash = hashPayload(params.payload);
  const base = buildSignaturePayload({
    payloadHash,
    timestamp: params.timestamp,
    idempotencyKey: params.idempotencyKey,
  });
  const expected = createHash("sha256").update(`${secret}:${base}`).digest("hex");
  if (expected !== params.signature) return { ok: false, reason: "BAD_SIGNATURE" };

  const parsedTs = Number(params.timestamp);
  if (!Number.isFinite(parsedTs)) return { ok: false, reason: "BAD_TIMESTAMP" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsedTs) > MAX_SKEW_SEC) return { ok: false, reason: "STALE_TIMESTAMP" };

  return { ok: true };
}

export function getSigningWindowSeconds(): number {
  if (Number.isFinite(DEFAULT_WINDOW_SEC) && DEFAULT_WINDOW_SEC > 0) return DEFAULT_WINDOW_SEC;
  return 300;
}
