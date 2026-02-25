import { hashPayload } from "./hash";
import { apiV1 } from "@/lib/api/url";

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
}) {
  const inputHash = hashPayload(data.input);
  const outputHash = data.output ? hashPayload(data.output) : undefined;
  await fetch(apiV1("/reliability/ingest"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...data,
      inputHash,
      outputHash,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    }),
  });
}
