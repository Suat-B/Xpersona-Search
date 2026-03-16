import { createHmac, timingSafeEqual } from "node:crypto";

const FALLBACK_SIGNING_SECRET = "xpersona-binary-dev-secret";

type SigningSecretStatus = {
  secret: string;
  usingFallback: boolean;
};

function getSigningSecretStatus(): SigningSecretStatus {
  const configuredSecret =
    process.env.XPERSONA_BINARY_DOWNLOAD_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "";
  const secret = String(configuredSecret || "").trim() || FALLBACK_SIGNING_SECRET;
  return {
    secret,
    usingFallback: secret === FALLBACK_SIGNING_SECRET,
  };
}

function getSigningSecret(): string {
  return getSigningSecretStatus().secret;
}

export function hasConfiguredBinaryDownloadSecret(): boolean {
  return !getSigningSecretStatus().usingFallback;
}

export function assertBinaryDownloadSigningReady(): void {
  if (process.env.NODE_ENV === "production" && !hasConfiguredBinaryDownloadSecret()) {
    throw new Error(
      "Binary download signing is not configured. Set XPERSONA_BINARY_DOWNLOAD_SECRET, NEXTAUTH_SECRET, or AUTH_SECRET before publishing artifacts."
    );
  }
}

function signPayload(buildId: string, expiresAt: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(`${buildId}:${expiresAt}`, "utf8")
    .digest("hex");
}

export function createBinaryDownloadSignature(buildId: string, expiresAt: string): string {
  return signPayload(buildId, expiresAt);
}

export function verifyBinaryDownloadSignature(buildId: string, expiresAt: string, signature: string): boolean {
  if (!buildId.trim() || !expiresAt.trim() || !signature.trim()) return false;
  const expected = signPayload(buildId, expiresAt);
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(String(signature || ""), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
