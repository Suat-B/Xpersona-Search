import { randomUUID } from "crypto";
import { hashPayload } from "./hash";
import { apiV1 } from "@/lib/api/url";
import { getActiveGpgKeyId, signPayload } from "@/lib/gpg/security";
import { hashPayload as hashGpgPayload } from "@/lib/gpg/hash";

export async function recordRun(data: {
  agentId: string;
  jobId?: string;
  input: unknown;
  output?: unknown;
  status: "SUCCESS" | "FAILURE" | "TIMEOUT" | "PARTIAL";
  latencyMs: number;
  costUsd: number;
  confidence?: number;
  hallucinationScore?: number;
  modelUsed: string;
  tokensInput?: number;
  tokensOutput?: number;
  trace?: Record<string, unknown>;
  authToken: string;
  idempotencyKey?: string;
  signingKeyId?: string;
}) {
  if (!data.authToken) {
    throw new Error("Authorization token required");
  }
  const inputHash = hashPayload(data.input);
  const outputHash = data.output ? hashPayload(data.output) : undefined;
  const idempotencyKey = data.idempotencyKey ?? randomUUID();
  const keyId = data.signingKeyId ?? getActiveGpgKeyId();
  if (!keyId) {
    throw new Error("Signing key required");
  }
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = {
    agentId: data.agentId,
    jobId: data.jobId,
    input: data.input,
    output: data.output,
    status: data.status,
    latencyMs: data.latencyMs,
    costUsd: data.costUsd,
    confidence: data.confidence,
    hallucinationScore: data.hallucinationScore,
    modelUsed: data.modelUsed,
    tokensInput: data.tokensInput,
    tokensOutput: data.tokensOutput,
    trace: data.trace,
    inputHash,
    outputHash,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
  const signature = signPayload({
    payloadHash: hashGpgPayload(payload),
    timestamp,
    idempotencyKey,
    keyId,
  });
  const res = await fetch(apiV1("/reliability/ingest"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.authToken}`,
      "idempotency-key": idempotencyKey,
      "x-gpg-key-id": keyId,
      "x-gpg-timestamp": timestamp,
      "x-gpg-signature": signature,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Reliability ingest failed (${res.status})${text ? `: ${text}` : ""}`);
  }
  return await res.json().catch(() => ({}));
}
