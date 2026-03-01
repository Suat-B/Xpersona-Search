import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { trustReceipts } from "@/lib/db/schema";
import { hasTrustTable } from "@/lib/trust/db";
import { eq } from "drizzle-orm";
import { getServiceBaseUrl } from "@/lib/subdomain";

export const revalidate = 300;

type Candidate = {
  id: string;
  slug: string | null;
  name: string | null;
  rank: number | null;
  source: string | null;
};

type ChosenAgent = {
  id: string;
  slug: string | null;
  name: string | null;
  reason: string | null;
};

function pickString(value: unknown, max = 256): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function pickNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function normalizeCandidate(value: unknown): Candidate | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = pickString(record.id, 128);
  if (!id) return null;
  return {
    id,
    slug: pickString(record.slug, 128),
    name: pickString(record.name, 256),
    rank: pickNumber(record.rank),
    source: pickString(record.source, 64),
  };
}

function normalizeChosenAgent(value: unknown): ChosenAgent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = pickString(record.id, 128);
  if (!id) return null;
  return {
    id,
    slug: pickString(record.slug, 128),
    name: pickString(record.name, 256),
    reason: pickString(record.reason, 2000),
  };
}

function normalizeChecks(payload: Record<string, unknown>) {
  const raw = payload.checks;
  if (!raw || typeof raw !== "object") {
    return {
      snapshot: false,
      contract: false,
      trust: false,
      policy: false,
    };
  }
  const record = raw as Record<string, unknown>;
  return {
    snapshot: record.snapshot === true,
    contract: record.contract === true,
    trust: record.trust === true,
    policy: record.policy === true,
  };
}

function normalizeChecksRun(payload: Record<string, unknown>, checks: ReturnType<typeof normalizeChecks>) {
  const raw = payload.checksRun;
  const list =
    Array.isArray(raw)
      ? raw
          .map((item) => pickString(item, 64))
          .filter((item): item is string => Boolean(item))
      : [];
  if (list.length > 0) return list;
  return [
    checks.snapshot ? "/snapshot" : null,
    checks.contract ? "/contract" : null,
    checks.trust ? "/trust" : null,
    checks.policy ? "/search/policy" : null,
  ].filter((item): item is string => Boolean(item));
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  if (!receiptId) return notFound();
  if (!(await hasTrustTable("trust_receipts"))) return notFound();

  const rows = await db
    .select()
    .from(trustReceipts)
    .where(eq(trustReceipts.id, receiptId))
    .limit(1);

  const receipt = rows[0];
  if (!receipt) return notFound();

  const payload = (receipt.eventPayload ?? {}) as Record<string, unknown>;
  const query = pickString(payload.query, 500);
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
        .map(normalizeCandidate)
        .filter((value): value is Candidate => Boolean(value))
    : [];
  const chosenAgents = Array.isArray(payload.chosenAgents)
    ? payload.chosenAgents
        .map(normalizeChosenAgent)
        .filter((value): value is ChosenAgent => Boolean(value))
    : [];
  const checks = normalizeChecks(payload);
  const checksRun = normalizeChecksRun(payload, checks);
  const issuedAt = pickString(payload.issuedAt, 64);
  const baseUrl = getServiceBaseUrl("hub");
  const publicUrl = `${baseUrl}/r/${receiptId}`;
  const embedSnippet = `<a href="${publicUrl}" rel="noopener noreferrer" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,45,85,0.3);background:rgba(255,45,85,0.1);color:#ff2d55;font-weight:600;font-size:12px;text-decoration:none;">Verified by Xpersona</a>`;

  return (
    <main className="min-h-dvh bg-[var(--bg-deep)] text-white">
      <div className="container mx-auto px-4 py-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-heart)]">
                Xpersona Receipt
              </p>
              <h1 className="text-3xl font-semibold">Verified Results</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Shareable proof showing the checks behind an agent recommendation.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--accent-heart)]">
              Verified by Xpersona
            </div>
          </div>

          <section className="agent-card p-5 space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Query</h2>
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
              {query ?? "Query unavailable"}
            </p>
          </section>

          <section className="agent-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Candidates</h2>
              <span className="text-xs text-[var(--text-tertiary)]">
                {candidates.length} evaluated
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {candidates.map((candidate) => (
                <div
                  key={`${candidate.id}-${candidate.slug ?? "candidate"}`}
                  className="rounded-xl border border-[var(--border)] bg-black/30 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      {candidate.name ?? candidate.slug ?? candidate.id}
                    </div>
                    {candidate.rank != null && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        Rank {candidate.rank.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-[var(--text-tertiary)] break-all">
                    {candidate.slug ?? candidate.id}
                  </div>
                  {candidate.source && (
                    <div className="mt-2 text-xs text-[var(--text-tertiary)]">
                      Source {candidate.source}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="agent-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Chosen agents</h2>
              <span className="text-xs text-[var(--text-tertiary)]">
                {chosenAgents.length} selected
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {chosenAgents.map((agent) => (
                <div
                  key={`${agent.id}-${agent.slug ?? "chosen"}`}
                  className="rounded-xl border border-[var(--border)] bg-black/30 p-4"
                >
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    {agent.name ?? agent.slug ?? agent.id}
                  </div>
                  <div className="mt-2 text-xs text-[var(--text-tertiary)] break-all">
                    {agent.slug ?? agent.id}
                  </div>
                  {agent.reason && (
                    <p className="mt-2 text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
                      {agent.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="agent-card p-5 space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Checks run</h2>
            <div className="flex flex-wrap gap-2">
              {checksRun.map((check) => (
                <span
                  key={check}
                  className="rounded-full border border-[var(--accent-teal)]/30 bg-[var(--accent-teal)]/10 px-3 py-1 text-xs font-semibold text-[var(--accent-teal)]"
                >
                  {check}
                </span>
              ))}
              {checksRun.length === 0 && (
                <span className="text-sm text-[var(--text-tertiary)]">
                  Checks unavailable
                </span>
              )}
            </div>
          </section>

          <section className="agent-card p-5 space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Receipt details</h2>
            <div className="space-y-3 text-xs text-[var(--text-tertiary)]">
              <div>
                <div className="uppercase tracking-widest">Receipt ID</div>
                <code className="block mt-1 rounded bg-black/40 p-2 text-[var(--text-secondary)] break-all">
                  {receipt.id}
                </code>
              </div>
              {issuedAt && (
                <div>
                  <div className="uppercase tracking-widest">Issued at</div>
                  <div className="mt-1 text-[var(--text-secondary)]">{issuedAt}</div>
                </div>
              )}
              <div>
                <div className="uppercase tracking-widest">Payload hash</div>
                <code className="block mt-1 rounded bg-black/40 p-2 text-[var(--text-secondary)] break-all">
                  {receipt.payloadHash}
                </code>
              </div>
              <div>
                <div className="uppercase tracking-widest">Signature</div>
                <code className="block mt-1 rounded bg-black/40 p-2 text-[var(--text-secondary)] break-all">
                  {receipt.signature}
                </code>
              </div>
              <div>
                <div className="uppercase tracking-widest">Key ID</div>
                <div className="mt-1 text-[var(--text-secondary)]">{receipt.keyId}</div>
              </div>
              <div>
                <div className="uppercase tracking-widest">Receipt JSON</div>
                <a
                  className="mt-1 inline-flex text-[var(--accent-heart)] hover:underline"
                  href={`/api/trust/receipts/${receiptId}`}
                >
                  /api/trust/receipts/{receiptId}
                </a>
              </div>
            </div>
          </section>

          <section className="agent-card p-5 space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Verified by Xpersona embed
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Copy and paste this snippet anywhere you share the recommendation.
            </p>
            <pre className="overflow-x-auto rounded bg-black/40 p-3 text-xs text-emerald-300">
              {embedSnippet}
            </pre>
            <div className="text-xs text-[var(--text-tertiary)] break-all">
              {publicUrl}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
