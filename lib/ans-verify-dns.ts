/**
 * ANS DNS verification — polls TXT records at _agent.{name}.agent.xpersona.co
 * to set verified=true when the expected value matches.
 * Uses Node dns.promises for resolution.
 */

import dns from "dns/promises";
import { generateDnsTxtRecord } from "./ans-crypto";
import { getVerificationDomain } from "./ans-validator";

const TXT_SUBDOMAIN = "_agent";

/**
 * Verify that the DNS TXT record for the domain matches the expected value
 * (generated from the domain's public key).
 *
 * @param domainName - The ANS subdomain (e.g. "kimi")
 * @param expectedTxt - The expected TXT value (e.g. from generateDnsTxtRecord(publicKey))
 * @returns true if any resolved TXT record matches expectedTxt
 */
export async function verifyDomainDns(
  domainName: string,
  expectedTxt: string
): Promise<boolean> {
  const verificationDomain = getVerificationDomain(domainName);
  const txtName = `${TXT_SUBDOMAIN}.${verificationDomain}`;

  try {
    const records = await dns.resolveTxt(txtName);

    // records is string[][] — each element is an array of strings for one record
    for (const rr of records) {
      for (const value of rr) {
        // DNS may return quoted strings; normalize by stripping surrounding quotes
        const normalized = value.replace(/^"|"$/g, "").trim();
        if (normalized === expectedTxt) {
          return true;
        }
      }
    }
    return false;
  } catch (err) {
    // NXDOMAIN, timeout, etc. — not verified
    return false;
  }
}

/**
 * Verify domain using public key. Converts publicKey to expected TXT and calls verifyDomainDns.
 */
export async function verifyDomainByPublicKey(
  domainName: string,
  publicKey: string
): Promise<boolean> {
  const expectedTxt = generateDnsTxtRecord(publicKey);
  return verifyDomainDns(domainName, expectedTxt);
}
