"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { ProfileStatsCard } from "@/components/dashboard/ProfileStatsCard";

type ProfileStats = {
  balance: number;
  credits: number;
  faucetCredits: number;
  memberSince: string | null;
  lastBetAt: string | null;
  totalBets: number;
  totalWagered: number;
  totalPnl: number;
  winRate: number;
  byGame: Record<
    string,
    { bets: number; wagered: number; pnl: number; wins: number; winRate: number }
  >;
};

type UserData = {
  id: string;
  email: string | null;
  name: string | null;
  image?: string | null;
};

const GAME_LABELS: Record<string, string> = {
  dice: "Dice",
  plinko: "Plinko",
  slots: "Slots",
  blackjack: "Blackjack",
  crash: "Crash",
};

const GAME_LINKS: Record<string, string> = {
  dice: "/games/dice",
  plinko: "/games/plinko",
  slots: "/games/slots",
  blackjack: "/games/blackjack",
  crash: "/games/crash",
};

function ProfilePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserData | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [userRes, statsRes] = await Promise.all([
        fetch("/api/me", { credentials: "include" }),
        fetch("/api/me/profile-stats", { credentials: "include" }),
      ]);
      const userData = await userRes.json().catch(() => ({}));
      const statsData = await statsRes.json().catch(() => ({}));
      if (userData.success && userData.data) {
        setUser({
          id: userData.data.id,
          email: userData.data.email ?? null,
          name: userData.data.name ?? null,
          image: userData.data.image ?? null,
        });
      }
      if (statsData.success && statsData.data) {
        setStats(statsData.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("balance-updated", refresh);
    return () => window.removeEventListener("balance-updated", refresh);
  }, [refresh]);

  // Handle guest-to-Google link flow: after sign-in, merge guest data
  useEffect(() => {
    const linkGuest = searchParams?.get("link_guest");
    if (linkGuest !== "1") return;

    fetch("/api/auth/link-guest", {
      method: "POST",
      credentials: "include",
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (data.success) {
          router.replace("/dashboard/profile");
          window.dispatchEvent(new Event("balance-updated"));
        }
      })
      .catch(() => {});
  }, [searchParams, router]);

  const isGuest = user?.email?.endsWith?.("@xpersona.guest");
  const hasGoogleProvider = true; // We assume Google is configured if user sees this

  const formatDate = (s: string | null) => {
    if (!s) return "—";
    try {
      return new Date(s).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const gamesWithActivity = stats
    ? Object.entries(stats.byGame)
        .filter(([, s]) => s.bets > 0)
        .sort(([, a], [, b]) => b.bets - a.bets)
    : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)] text-[var(--text-primary)] tracking-tight">
          Profile
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Your stats and performance across all games
        </p>
      </header>

      {loading ? (
        <div className="space-y-6">
          <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Profile header */}
          <GlassCard className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white/10">
                {user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt=""
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-secondary)]">
                    {user?.name?.[0] ?? user?.email?.[0] ?? "?"}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                  {user?.name ?? "Guest"}
                </h2>
                <p className="text-sm text-[var(--text-secondary)] truncate">
                  {user?.email ?? "—"}
                </p>
                {stats?.memberSince && (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Member since {formatDate(stats.memberSince)}
                  </p>
                )}
                {isGuest && hasGoogleProvider && (
                  <Link
                    href="/api/auth/signin/google?callbackUrl=%2Fdashboard%2Fprofile%3Flink_guest%3D1"
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--accent-heart)]/50 bg-[var(--accent-heart)]/10 px-4 py-2 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
                  >
                    Upgrade to Google
                  </Link>
                )}
              </div>
            </div>
          </GlassCard>

          {/* Stats cards */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
              Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ProfileStatsCard
                label="Balance"
                value={stats ? `${stats.balance} credits` : "—"}
              />
              <ProfileStatsCard
                label="Total PnL"
                value={stats ? (stats.totalPnl >= 0 ? `+${stats.totalPnl}` : stats.totalPnl) : "—"}
                valueColor={
                  stats
                    ? stats.totalPnl >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                    : undefined
                }
              />
              <ProfileStatsCard
                label="Win Rate"
                value={stats ? `${stats.winRate}%` : "—"}
                subtext={
                  stats && stats.totalBets > 0
                    ? `${stats.totalBets} rounds`
                    : undefined
                }
              />
              <ProfileStatsCard
                label="Total Wagered"
                value={stats ? `${stats.totalWagered} credits` : "—"}
                subtext={
                  stats?.lastBetAt
                    ? `Last bet ${formatDate(stats.lastBetAt)}`
                    : undefined
                }
              />
            </div>
          </section>

          {/* Per-game breakdown */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
              By Game
            </h2>
            {gamesWithActivity.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {gamesWithActivity.map(([gameType, s]) => (
                  <Link
                    key={gameType}
                    href={GAME_LINKS[gameType] ?? `/games/${gameType}`}
                    className="block group"
                  >
                    <GlassCard className="p-4 hover:border-[var(--accent-heart)]/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[var(--text-primary)]">
                          {GAME_LABELS[gameType] ?? gameType}
                        </span>
                        <span
                          className={`text-sm font-mono font-bold ${
                            s.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {s.pnl >= 0 ? `+${s.pnl}` : s.pnl}
                        </span>
                      </div>
                      <div className="mt-2 flex gap-4 text-xs text-[var(--text-secondary)]">
                        <span>{s.bets} bets</span>
                        <span>{s.wagered} wagered</span>
                        <span>{s.winRate}% win</span>
                      </div>
                      <span className="mt-2 inline-block text-xs font-medium text-[var(--accent-heart)] opacity-0 group-hover:opacity-100 transition-opacity">
                        Play →
                      </span>
                    </GlassCard>
                  </Link>
                ))}
              </div>
            ) : (
              <GlassCard className="p-6">
                <p className="text-sm text-[var(--text-secondary)]">
                  No bets yet. Play a game to see your stats here.
                </p>
                <Link
                  href="/games/dice"
                  className="mt-3 inline-block text-sm font-medium text-[var(--accent-heart)] hover:underline"
                >
                  Play Dice →
                </Link>
              </GlassCard>
            )}
          </section>

          {/* Bet history link */}
          <section>
            <Link
              href="/dashboard/provably-fair"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 transition-colors"
            >
              <span>View provably fair bet history</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </section>
        </>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="h-8 w-48 rounded bg-white/10 animate-pulse" />
          <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <ProfilePageClient />
    </Suspense>
  );
}
