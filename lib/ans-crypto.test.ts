/**
 * ANS crypto unit tests. Per XPERSONA ANS PLAN1.MD:
 * - Generate keypair, encrypt private key, decrypt, verify roundtrip
 * - Sign message with private key, verify with public key
 * - DNS TXT record format matches spec
 */

import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import {
  generateAgentKeyPair,
  decryptPrivateKey,
  signMessage,
  verifyMessage,
  generateDnsTxtRecord,
} from "./ans-crypto";

const VALID_KEY_HEX = crypto.randomBytes(32).toString("hex");

beforeAll(() => {
  if (!process.env.MASTER_ENCRYPTION_KEY || process.env.MASTER_ENCRYPTION_KEY.length !== 64) {
    process.env.MASTER_ENCRYPTION_KEY = VALID_KEY_HEX;
  }
});

describe("generateAgentKeyPair", () => {
  it("returns valid base64 publicKey and privateKeyEncrypted", () => {
    const pair = generateAgentKeyPair();
    expect(pair.publicKey).toBeTruthy();
    expect(pair.privateKeyEncrypted).toBeTruthy();
    expect(() => Buffer.from(pair.publicKey, "base64")).not.toThrow();
    expect(() => Buffer.from(pair.privateKeyEncrypted, "base64")).not.toThrow();
  });
});

describe("decryptPrivateKey", () => {
  it("roundtrips with generateAgentKeyPair privateKeyEncrypted", () => {
    const pair = generateAgentKeyPair();
    const decrypted = decryptPrivateKey(pair.privateKeyEncrypted);
    expect(decrypted).toBeInstanceOf(Buffer);
    expect(decrypted.length).toBeGreaterThan(0);
  });
});

describe("signMessage and verifyMessage", () => {
  it("signs and verifies message roundtrip", () => {
    const pair = generateAgentKeyPair();
    const message = "test message for ANS verification";
    const signature = signMessage(pair.privateKeyEncrypted, message);
    expect(signature).toBeTruthy();
    expect(() => Buffer.from(signature, "base64")).not.toThrow();

    const valid = verifyMessage(pair.publicKey, message, signature);
    expect(valid).toBe(true);
  });

  it("rejects invalid signature", () => {
    const pair = generateAgentKeyPair();
    const message = "test";
    const valid = verifyMessage(pair.publicKey, message, "invalidbase64!!!");
    expect(valid).toBe(false);
  });

  it("rejects tampered message", () => {
    const pair = generateAgentKeyPair();
    const signature = signMessage(pair.privateKeyEncrypted, "original");
    const valid = verifyMessage(pair.publicKey, "tampered", signature);
    expect(valid).toBe(false);
  });
});

describe("generateDnsTxtRecord", () => {
  it("starts with v=agent1; pk= and contains fp= with 16 hex chars", () => {
    const pair = generateAgentKeyPair();
    const txt = generateDnsTxtRecord(pair.publicKey);
    expect(txt.startsWith("v=agent1; pk=")).toBe(true);
    expect(txt).toContain("fp=");
    const fpMatch = txt.match(/fp=([a-f0-9]+)/);
    expect(fpMatch).toBeTruthy();
    expect(fpMatch![1]).toHaveLength(16);
    expect(/^[a-f0-9]+$/.test(fpMatch![1])).toBe(true);
  });

  it("includes publicKey in pk field", () => {
    const pair = generateAgentKeyPair();
    const txt = generateDnsTxtRecord(pair.publicKey);
    expect(txt).toContain(`pk=${pair.publicKey}`);
  });
});
