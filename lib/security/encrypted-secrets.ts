import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const SECRET_PREFIX = "xpsec_v1";

function getMasterSecret(): string {
  const raw =
    process.env.MASTER_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "development"
      ? "xpersona-dev-master-encryption-key-do-not-use-in-production"
      : "");
  if (!raw) {
    throw new Error("MASTER_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set");
  }
  return raw;
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecretPayload(value: unknown): string {
  const key = deriveKey(getMasterSecret());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value ?? null), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SECRET_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecretPayload<T>(value: string): T | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const [prefix, ivRaw, tagRaw, ciphertextRaw] = raw.split(".");
  if (prefix !== SECRET_PREFIX || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("Invalid encrypted secret payload.");
  }
  const key = deriveKey(getMasterSecret());
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
