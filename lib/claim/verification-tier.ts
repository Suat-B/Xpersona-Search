import type { VerificationMethod } from "./verification-methods";

export type VerificationTier = "NONE" | "BRONZE" | "SILVER" | "GOLD";

export function verificationTierForMethod(
  method: VerificationMethod
): VerificationTier {
  if (
    method === "GITHUB_FILE" ||
    method === "NPM_KEYWORD" ||
    method === "PYPI_KEYWORD" ||
    method === "EMAIL_MATCH" ||
    method === "MANUAL_REVIEW"
  ) {
    return "BRONZE";
  }

  if (method === "DNS_TXT" || method === "META_TAG") {
    return "SILVER";
  }

  if (method === "CRYPTO_SIGNATURE") {
    return "GOLD";
  }

  return "NONE";
}
