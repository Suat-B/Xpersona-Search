"use client";

import { useState, useEffect, useCallback } from "react";

interface DiceBet {
  id: string;
  amount: number;
  outcome: string;
  payout: number;
  pnl: number;
  createdAt: string;
  resultPayload?: { value?: number; target?: number; condition?: string } | null;
  verification?: { serverSeedHash: string | null; clientSeed: string; nonce: number };
}

interface VerificationDetail {
  serverSeedHash: string | null;
  clientSeed: string;
  nonce: number;
  serverSeed?: string;
  verificationFormula?: string;
}

export function DiceVerificationHistory() {
  const [bets, setBets] = useState<DiceBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const fetchBets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/bets?gameType=dice&limit=15", { credentials: "include" });
      const text = await res.text();
      let data: { success?: boolean; data?: { bets?: DiceBet[] } };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setBets([]);
        return;
      }
      if (data.success && Array.isArray(data.data?.bets)) {
        setBets(data.data.bets);
      } else {
        setBets([]);
      }
    } catch {
      setBets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBets();
  }, [fetchBets]);

  useEffect(() => {
    const onUpdate = () => fetchBets();
    window.addEventListener("balance-updated", onUpdate);
    return () => window.removeEventListener("balance-updated", onUpdate);
  }, [fetchBets]);

  const openVerify = useCallback(async (betId: string) => {
    setVerifyId(betId);
    setDetail(null);
    setRevealed(false);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/me/bets/${betId}`, { credentials: "include" });
      const text = await res.text();
      let data: { success?: boolean; data?: { verification?: VerificationDetail } };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setDetail(null);
        return;
      }
      if (data.success && data.data?.verification) {
        setDetail({
          serverSeedHash: data.data.verification.serverSeedHash ?? null,
          clientSeed: data.data.verification.clientSeed ?? "",
          nonce: data.data.verification.nonce ?? 0,
          verificationFormula: data.data.verification.verificationFormula,
        });
      }
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const revealSeed = useCallback(async () => {
    if (!verifyId) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/me/bets/${verifyId}?reveal=1`, { credentials: "include" });
      const text = await res.text();
      let data: { success?: boolean; data?: { verification?: VerificationDetail & { serverSeed?: string } } };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        return;
      }
      if (data.success && data.data?.verification) {
        setDetail((prev) =>
          prev
            ? { ...prev, serverSeed: data.data.verification.serverSeed }
            : null
        );
        setRevealed(true);
      }
    } finally {
      setDetailLoading(false);
    }
  }, [verifyId]);

  const closeModal = useCallback(() => {
    setVerifyId(null);
    setDetail(null);
    setRevealed(false);
  }, []);

  const value = (b: DiceBet) =>
    b.resultPayload?.value ?? (b as unknown as { result?: number }).result;

  return (
    <>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-matte)]/50 flex items-center justify-between">
          <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Verifiable history
          </h3>
        </div>
        <div className="max-h-[140px] overflow-y-auto">
          {loading ? (
            <div className="px-4 py-4 text-center text-xs text-[var(--text-secondary)]">Loading…</div>
          ) : bets.length === 0 ? (
            <div className="px-4 py-4 text-center text-xs text-[var(--text-secondary)]">No dice bets yet</div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {bets.slice(0, 8).map((b) => (
                <li key={b.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text-secondary)] truncate">
                    {typeof value(b) === "number" ? value(b).toFixed(2) : "—"} · {b.amount} · {b.outcome === "win" ? "+" : ""}{b.pnl}
                  </span>
                  <button
                    type="button"
                    onClick={() => openVerify(b.id)}
                    className="flex-shrink-0 text-[10px] font-medium text-[var(--accent-heart)] hover:underline"
                  >
                    Verify
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {verifyId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-title"
        >
          <div
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl max-w-md w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="verify-title" className="text-sm font-semibold text-[var(--text-primary)]">
                Provably fair verification
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 rounded text-[var(--text-secondary)] hover:bg-white/10"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {detailLoading && !detail ? (
              <p className="text-xs text-[var(--text-secondary)]">Loading…</p>
            ) : detail ? (
              <div className="space-y-2 text-xs font-mono">
                <p><span className="text-[var(--text-secondary)]">Server seed hash:</span> {detail.serverSeedHash ?? "—"}</p>
                <p><span className="text-[var(--text-secondary)]">Client seed:</span> {detail.clientSeed || "(empty)"}</p>
                <p><span className="text-[var(--text-secondary)]">Nonce:</span> {detail.nonce}</p>
                {detail.verificationFormula && (
                  <p className="pt-2 text-[10px] text-[var(--text-secondary)] break-words">{detail.verificationFormula}</p>
                )}
                {detail.serverSeed != null && (
                  <p className="pt-2"><span className="text-[var(--text-secondary)]">Server seed (revealed):</span> {detail.serverSeed}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">Could not load verification data.</p>
            )}
            {detail && !revealed && (
              <button
                type="button"
                onClick={revealSeed}
                disabled={detailLoading}
                className="w-full py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] text-xs font-medium text-[var(--accent-heart)] hover:bg-white/5 disabled:opacity-50"
              >
                {detailLoading ? "Loading…" : "Reveal server seed"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
