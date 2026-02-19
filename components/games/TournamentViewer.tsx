"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function CloneWinnerButton({
  strategySnapshot,
  name,
}: {
  strategySnapshot: unknown;
  name: string;
}) {
  const [cloning, setCloning] = useState(false);
  const handleClone = async () => {
    setCloning(true);
    try {
      const res = await fetch("/api/me/advanced-strategies/clone-from-tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ strategySnapshot, name }),
      });
      const data = await res.json();
      if (data.success && data.data?.id) {
        window.location.href = `/trading/developer/list?selectedId=${data.data.id}`;
      }
    } finally {
      setCloning(false);
    }
  };
  return (
    <div className="border-t border-[var(--dash-divider)] px-6 py-4 bg-[#30d158]/5">
      <p className="text-sm text-[var(--dash-text-secondary)] mb-2">Winner: {name}</p>
      <button
        type="button"
        onClick={handleClone}
        disabled={cloning}
        className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#30d158]/90 disabled:opacity-50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50"
      >
        {cloning ? "Cloning…" : "Clone winner"}
      </button>
    </div>
  );
}

interface Participant {
  id: string;
  name: string;
  rank: number | null;
  finalPnL: number | null;
  finalSharpe: number | null;
  strategySnapshot: unknown;
}

interface TournamentData {
  session: { id: string; status: string; createdAt: string } | null;
  participants: Participant[];
}

export function TournamentViewer() {
  const [data, setData] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const fetchTournament = () => {
    fetch("/api/games/dice/tournament", { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) setData(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchTournament();
  }, []);

  const startTournament = async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/games/dice/tournament", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } finally {
      setStarting(false);
    }
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

  if (loading) {
    return (
      <div className="agent-card p-8 border-[var(--dash-divider)]">
        <p className="text-[var(--dash-text-secondary)]">Loading tournament…</p>
      </div>
    );
  }

  const hasSession = data?.session && data.participants.length > 0;
  const winner = data?.participants[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
            AI vs AI Tournament
          </h1>
          <p className="mt-1 text-sm text-[var(--dash-text-secondary)]">
            Watch AI agents compete. Clone the winner to your strategies.
          </p>
        </div>
        <button
          type="button"
          onClick={startTournament}
          disabled={starting}
          className="shrink-0 inline-flex items-center gap-2 rounded-full bg-[#30d158] px-6 py-3 text-sm font-semibold text-white hover:bg-[#30d158]/90 disabled:opacity-50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50"
        >
          {starting ? "Running…" : "Start Tournament"}
        </button>
      </div>

      {hasSession ? (
        <div className="agent-card overflow-hidden border-[var(--dash-divider)]">
          <h2 className="px-6 py-4 font-semibold text-[var(--text-primary)] border-b border-[var(--dash-divider)]">
            Leaderboard
          </h2>
          <div className="divide-y divide-[var(--dash-divider)]">
            {data!.participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      p.rank === 1
                        ? "bg-amber-500/20 text-amber-400"
                        : p.rank === 2
                          ? "bg-slate-400/20 text-slate-300"
                          : p.rank === 3
                            ? "bg-amber-700/20 text-amber-600"
                            : "bg-[var(--dash-divider)] text-[var(--dash-text-secondary)]"
                    }`}
                  >
                    {p.rank ?? "—"}
                  </span>
                  <span className="font-medium text-[var(--text-primary)]">
                    {capitalize(p.name)}
                  </span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span
                    className={
                      (p.finalPnL ?? 0) >= 0 ? "text-[#30d158]" : "text-red-400"
                    }
                  >
                    {(p.finalPnL ?? 0) >= 0 ? "+" : ""}
                    {p.finalPnL?.toFixed(0) ?? "0"} credits
                  </span>
                  {(p.finalSharpe ?? null) != null && (
                    <span className="text-[var(--dash-text-secondary)]">
                      Sharpe {(p.finalSharpe ?? 0).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {winner && (
            <CloneWinnerButton
              strategySnapshot={winner.strategySnapshot}
              name={capitalize(winner.name)}
            />
          )}
        </div>
      ) : (
        <div className="agent-card p-8 border-[var(--dash-divider)]">
          <p className="text-[var(--dash-text-secondary)] mb-4">
            No tournament yet. Click "Start Tournament" to run 6 AI agents and see who wins.
          </p>
          <button
            type="button"
            onClick={startTournament}
            disabled={starting}
            className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#30d158]/90 disabled:opacity-50 transition-all"
          >
            {starting ? "Running…" : "Start Tournament"}
          </button>
        </div>
      )}

      <Link
        href="/games/dice"
        className="text-sm text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors"
      >
        ← Back to Dice
      </Link>
    </div>
  );
}
