import { canonicalizePayload, hashPayload, signPayloadHash } from "@/lib/trust/receipts";
import type { GpgReceiptPayload } from "./types";

export function buildGpgReceiptPayload(params: GpgReceiptPayload) {
  const payload = {
    receiptType: params.receiptType,
    agentId: params.agentId,
    counterpartyAgentId: params.counterpartyAgentId ?? null,
    eventPayload: params.eventPayload,
    issuedAt: new Date().toISOString(),
  };
  const canonical = canonicalizePayload(payload);
  const payloadHash = hashPayload(canonical);
  return { payload, payloadHash };
}

export function signGpgReceipt(payloadHash: string, keyId: string) {
  return signPayloadHash(payloadHash, keyId);
}
