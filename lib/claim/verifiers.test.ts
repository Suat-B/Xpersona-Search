import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { runVerifier } from "./verifiers";

describe("runVerifier - CRYPTO_SIGNATURE", () => {
  it("verifies ed25519 signatures for claim challenge", async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const token = "tok_12345";
    const slug = "my-agent";
    const message = Buffer.from(`xpersona-verify:${slug}:${token}`, "utf8");
    const signature = crypto.sign(null, message, privateKey).toString("base64");

    const result = await runVerifier(
      "CRYPTO_SIGNATURE",
      { slug },
      token,
      undefined,
      {
        publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
        signature,
      }
    );

    expect(result.verified).toBe(true);
  });

  it("rejects invalid signature", async () => {
    const { publicKey } = crypto.generateKeyPairSync("ed25519");
    const result = await runVerifier(
      "CRYPTO_SIGNATURE",
      { slug: "my-agent" },
      "tok_12345",
      undefined,
      {
        publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
        signature: Buffer.from("bad-signature").toString("base64"),
      }
    );

    expect(result.verified).toBe(false);
  });
});
