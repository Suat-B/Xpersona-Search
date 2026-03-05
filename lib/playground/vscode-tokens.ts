import { createHash, createHmac, timingSafeEqual } from "crypto";

const ACCESS_TOKEN_PREFIX = "xp_vsat_";
const REFRESH_TOKEN_PREFIX = "xp_vrt_";

export type VscodeAccessTokenPayload = {
  v: 1;
  uid: string;
  email: string;
  iat: number;
  exp: number;
  aud: "vscode";
};

function getVscodeTokenSecret(): string {
  const secret =
    process.env.PLAYGROUND_VSCODE_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "development"
      ? "xpersona-dev-vscode-token-secret-min-32-chars-do-not-use-in-production"
      : "");
  if (!secret) throw new Error("PLAYGROUND_VSCODE_TOKEN_SECRET (or NEXTAUTH_SECRET) must be set");
  return secret;
}

function base64urlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function base64urlDecodeJson<T>(value: string): T | null {
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function signHex(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

export function isVscodeAccessToken(rawToken: string | null | undefined): boolean {
  return typeof rawToken === "string" && rawToken.startsWith(ACCESS_TOKEN_PREFIX);
}

export function signVscodeAccessToken(input: {
  userId: string;
  email: string;
  nowMs?: number;
  ttlMs?: number;
}): string {
  const nowMs = input.nowMs ?? Date.now();
  const ttlMs = input.ttlMs ?? 15 * 60 * 1000;
  const payload: VscodeAccessTokenPayload = {
    v: 1,
    uid: input.userId,
    email: input.email,
    iat: nowMs,
    exp: nowMs + ttlMs,
    aud: "vscode",
  };
  const payloadB64 = base64urlEncodeJson(payload);
  const secret = getVscodeTokenSecret();
  const sig = signHex(payloadB64, secret);
  return `${ACCESS_TOKEN_PREFIX}${payloadB64}.${sig}`;
}

export function verifyVscodeAccessToken(
  rawToken: string | null | undefined,
  options?: { nowMs?: number; maxClockSkewMs?: number }
): { userId: string; email: string } | null {
  if (!rawToken || typeof rawToken !== "string") return null;
  if (!rawToken.startsWith(ACCESS_TOKEN_PREFIX)) return null;
  const tokenBody = rawToken.slice(ACCESS_TOKEN_PREFIX.length);
  const dot = tokenBody.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = tokenBody.slice(0, dot);
  const sig = tokenBody.slice(dot + 1);
  if (!payloadB64 || !sig) return null;

  const secret = getVscodeTokenSecret();
  const expected = signHex(payloadB64, secret);
  if (!constantTimeEqualHex(expected, sig)) return null;

  const payload = base64urlDecodeJson<VscodeAccessTokenPayload>(payloadB64);
  if (!payload || payload.v !== 1 || payload.aud !== "vscode") return null;
  if (typeof payload.uid !== "string" || !payload.uid) return null;
  if (typeof payload.email !== "string" || !payload.email) return null;
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;

  const nowMs = options?.nowMs ?? Date.now();
  const skew = options?.maxClockSkewMs ?? 5 * 60 * 1000;
  if (payload.iat > nowMs + skew) return null;
  if (payload.exp <= nowMs - skew) return null;
  return { userId: payload.uid, email: payload.email };
}

export function hashOpaqueToken(raw: string): string {
  return createHash("sha256").update(String(raw || ""), "utf8").digest("hex");
}

export function isVscodeRefreshToken(raw: string | null | undefined): boolean {
  return typeof raw === "string" && raw.startsWith(REFRESH_TOKEN_PREFIX);
}

