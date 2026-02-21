/**
 * ANS cryptographic identity service.
 * ED25519 keypair generation, encrypted private key storage, sign/verify, DNS TXT record.
 * Per XPERSONA ANS PLAN1.MD — server-side only.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH_BYTES = 32;
const KEY_LENGTH_HEX = 64;

function getMasterKey(): Buffer {
  const hex = process.env.MASTER_ENCRYPTION_KEY;
  if (!hex || typeof hex !== "string") {
    throw new Error("MASTER_ENCRYPTION_KEY not set or invalid");
  }
  const cleaned = hex.trim().toLowerCase().replace(/^0x/, "");
  if (cleaned.length !== KEY_LENGTH_HEX || !/^[0-9a-f]+$/.test(cleaned)) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY must be ${KEY_LENGTH_HEX} hex chars (32 bytes)`
    );
  }
  return Buffer.from(cleaned, "hex");
}

export interface KeyPair {
  publicKey: string;
  privateKeyEncrypted: string;
}

/**
 * Generate ED25519 keypair. Private key is encrypted at rest with AES-256-GCM.
 */
export function generateAgentKeyPair(): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });

  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);

  let encrypted = cipher.update(privateKey);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([authTag, iv, encrypted]);

  return {
    publicKey: publicKey.toString("base64"),
    privateKeyEncrypted: combined.toString("base64"),
  };
}

/**
 * Decrypt stored private key. Throws on invalid ciphertext or key.
 */
export function decryptPrivateKey(encryptedBase64: string): Buffer {
  const masterKey = getMasterKey();
  const data = Buffer.from(encryptedBase64, "base64");

  if (data.length < AUTH_TAG_LENGTH + IV_LENGTH) {
    throw new Error("Invalid encrypted private key");
  }

  const authTag = data.subarray(0, AUTH_TAG_LENGTH);
  const iv = data.subarray(AUTH_TAG_LENGTH, AUTH_TAG_LENGTH + IV_LENGTH);
  const encrypted = data.subarray(AUTH_TAG_LENGTH + IV_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
}

/**
 * Sign message with decrypted private key. Returns base64 signature.
 */
export function signMessage(
  privateKeyEncrypted: string,
  message: string
): string {
  const privateKey = decryptPrivateKey(privateKeyEncrypted);
  const signature = crypto.sign(
    null,
    Buffer.from(message, "utf8"),
    privateKey
  );
  return signature.toString("base64");
}

/**
 * Verify message signature with public key.
 */
export function verifyMessage(
  publicKeyBase64: string,
  message: string,
  signatureBase64: string
): boolean {
  const publicKeyBuf = Buffer.from(publicKeyBase64, "base64");
  const signatureBuf = Buffer.from(signatureBase64, "base64");
  return crypto.verify(
    null,
    Buffer.from(message, "utf8"),
    publicKeyBuf,
    signatureBuf
  );
}

/**
 * Generate DNS TXT record value for agent verification.
 * Format: v=agent1; pk=<base64>; fp=<first 16 chars of SHA256 fingerprint>
 */
export function generateDnsTxtRecord(publicKeyBase64: string): string {
  const fingerprint = crypto
    .createHash("sha256")
    .update(Buffer.from(publicKeyBase64, "base64"))
    .digest("hex")
    .slice(0, 16);
  return `v=agent1; pk=${publicKeyBase64}; fp=${fingerprint}`;
}
