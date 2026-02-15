"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface Bet {
  id: string;
  gameType: string;
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

const PAGE_SIZE = 50;
const GAME_LABELS: Record<string, string> = {
  dice: "Dice",
};

export function ProvablyFairBetHistory() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [gameFilter, setGameFilter] = useState<string>("");
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const fetchBets = useCallback(async (off = 0, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(off),
      });
      if (gameFilter) params.set("gameType", gameFilter);
      const res = await fetch(`/api/me/rounds?${params}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (data.success && Array.isArray(data.data?.plays)) {
        const newPlays = data.data.plays as Bet[];
        setBets(append ? (prev) => [...prev, ...newPlays] : newPlays);
        setTotalCount(data.data.totalCount ?? newPlays.length);
      } else if (!append) {
        setBets([]);
        setTotalCount(0);
      }
    } catch {
      if (!append) setBets([]);
    } finally {
      setLoading(false);
    }
  }, [gameFilter]);

  useEffect(() => {
    fetchBets(0, false);
  }, [fetchBets]);

  useEffect(() => {
    const onUpdate = () => fetchBets(0, false);
    window.addEventListener("balance-updated", onUpdate);
    return () => window.removeEventListener("balance-updated", onUpdate);
  }, [fetchBets]);

  const loadMore = useCallback(() => {
    fetchBets(bets.length, true);
  }, [bets.length, fetchBets]);

  const openVerify = useCallback(async (betId: string) => {
    setVerifyId(betId);
    setDetail(null);
    setRevealed(false);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/me/rounds/${betId}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.data?.verification) {
        const v = data.data.verification;
        setDetail({
          serverSeedHash: v.serverSeedHash ?? null,
          clientSeed: v.clientSeed ?? "",
          nonce: v.nonce ?? 0,
          verificationFormula: v.verificationFormula,
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
      const res = await fetch(`/api/me/rounds/${verifyId}?reveal=1`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.data?.verification) {
        const v = data.data.verification;
        setDetail((prev) =>
          prev ? { ...prev, serverSeed: v.serverSeed } : null
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

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const value = (b: Bet) =>
    b.resultPayload?.value ?? (b as unknown as { result?: number }).result;

  const hasVerification = (b: Bet) =>
    b.verification?.serverSeedHash != null;

  return (
    <>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-matte)]/50 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            All past bets — Provably fair audit
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={gameFilter}
              onChange={(e) => setGameFilter(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--accent-heart)] focus:outline-none"
            >
              <option value="">All games</option>
              {Object.entries(GAME_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading && bets.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">
              Loading…
            </div>
          ) : bets.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">
              No bets yet. Play dice to see your provably fair history.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Game</th>
                  <th className="px-4 py-3">Bet</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Payout</th>
                  <th className="px-4 py-3">PnL</th>
                  <th className="px-4 py-3 text-right">Verify</th>
                </tr>
              </thead>
              <tbody>
                {bets.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-4 text-[var(--text-secondary)] font-mono text-xs">
                      {formatDate(b.createdAt)}
                    </td>
                    <td className="px-4 py-4 font-medium text-[var(--text-primary)]">
                      {GAME_LABELS[b.gameType] ?? b.gameType}
                    </td>
                    <td className="px-4 py-4 font-mono">{b.amount} credits</td>
                    <td className="px-4 py-4">
                      {typeof value(b) === "number" ? (
                        <span className="font-mono">{value(b)!.toFixed(2)}</span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">—</span>
                      )}
                      <span className="ml-1 text-[var(--text-secondary)]">
                        {b.outcome === "win" ? (
                          <span className="text-emerald-400">win</span>
                        ) : b.outcome === "loss" ? (
                          <span className="text-red-400">loss</span>
                        ) : (
                          b.outcome
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-mono">{b.payout} credits</td>
                    <td className="px-4 py-4">
                      <span
                        className={`font-mono font-bold ${
                          b.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {b.pnl >= 0 ? "+" : ""}
                        {b.pnl}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {hasVerification(b) ? (
                        <button
                          type="button"
                          onClick={() => openVerify(b.id)}
                          className="text-xs font-medium text-[var(--accent-heart)] hover:underline"
                        >
                          Verify
                        </button>
                      ) : (
                        <span className="text-[10px] text-[var(--text-secondary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {bets.length > 0 && bets.length < totalCount && (
          <div className="px-4 py-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="w-full py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 disabled:opacity-50"
            >
              {loading ? "Loading…" : `Load more (${bets.length} of ${totalCount})`}
            </button>
          </div>
        )}
      </div>

      {verifyId &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
            style={{ top: 0, left: 0, right: 0, bottom: 0 }}
            onClick={closeModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-title"
          >
            <div
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl max-w-md w-full p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between">
              <h2 id="verify-title" className="text-base font-semibold text-[var(--text-primary)]">
                Provably fair verification
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-white/10"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {detailLoading && !detail ? (
              <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
            ) : detail ? (
              <div className="space-y-3 text-sm font-mono">
                <p className="break-all">
                  <span className="text-[var(--text-secondary)] mr-2">Server seed hash:</span>
                  {detail.serverSeedHash ?? "—"}
                </p>
                <p>
                  <span className="text-[var(--text-secondary)] mr-2">Client seed:</span>
                  {detail.clientSeed || "(empty)"}
                </p>
                <p>
                  <span className="text-[var(--text-secondary)] mr-2">Nonce:</span>
                  {detail.nonce}
                </p>
                {detail.verificationFormula && (
                  <p className="pt-2 text-xs text-[var(--text-secondary)] break-words">
                    {detail.verificationFormula}
                  </p>
                )}
                {detail.serverSeed != null && (
                  <p className="pt-2 break-all text-emerald-400">
                    <span className="text-[var(--text-secondary)] mr-2">Server seed (revealed):</span>
                    {detail.serverSeed}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">Could not load verification data.</p>
            )}
            {detail && !revealed && (
              <button
                type="button"
                onClick={revealSeed}
                disabled={detailLoading}
                className="w-full py-2.5 rounded-lg border border-[var(--accent-heart)]/50 bg-[var(--accent-heart)]/10 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 disabled:opacity-50"
              >
                {detailLoading ? "Loading…" : "Reveal server seed"}
              </button>
            )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
