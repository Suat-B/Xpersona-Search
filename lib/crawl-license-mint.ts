import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "crypto";
import type { CrawlLicensePayload } from "@/lib/crawl-license";
import { encodeCrawlLicensePayload } from "@/lib/crawl-license";

export type GeneratedCrawlApiKey = {
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
};

function getSecret(): string {
  return process.env.CRAWL_LICENSE_SECRET?.trim() ?? "";
}

function getDeliveryEncryptionKey(): Buffer | null {
  const secret = getSecret();
  if (secret.length < 16) return null;
  return createHash("sha256")
    .update(`xpersona:crawl-delivery:${secret}`, "utf8")
    .digest();
}

export function hashCrawlApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function generateCrawlApiKey(): GeneratedCrawlApiKey {
  const rawKey = `xpcrawl_${randomBytes(24).toString("hex")}`;
  return {
    rawKey,
    keyHash: hashCrawlApiKey(rawKey),
    keyPrefix: rawKey.slice(0, 16),
  };
}

export function mintCrawlLicenseToken(params: {
  customerId: string;
  keyPrefix: string;
  ttlSeconds: number;
}): string | null {
  const secret = getSecret();
  if (secret.length < 16) return null;

  const exp =
    Math.floor(Date.now() / 1000) +
    Math.max(300, Math.min(Math.floor(params.ttlSeconds), 365 * 24 * 3600));
  const payload: CrawlLicensePayload = {
    v: 2,
    sub: params.customerId,
    kid: params.keyPrefix,
    exp,
    aud: "xpersona-crawl",
  };
  const payloadB64 = encodeCrawlLicensePayload(payload);
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function encryptCrawlDeliveryApiKey(apiKey: string): string | null {
  const key = getDeliveryEncryptionKey();
  if (!key) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

export function decryptCrawlDeliveryApiKey(payload: string): string | null {
  const key = getDeliveryEncryptionKey();
  if (!key) return null;

  try {
    const bytes = Buffer.from(payload, "base64url");
    if (bytes.length <= 28) return null;

    const iv = bytes.subarray(0, 12);
    const authTag = bytes.subarray(12, 28);
    const ciphertext = bytes.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
