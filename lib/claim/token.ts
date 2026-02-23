import crypto from "crypto";

const CLAIM_TOKEN_BYTES = 32;

export function generateClaimToken(): string {
  return crypto.randomBytes(CLAIM_TOKEN_BYTES).toString("hex");
}
