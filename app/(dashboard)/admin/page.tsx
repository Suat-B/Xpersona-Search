"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard, MetricCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

type RevenuePeriod = {
  earnings: number;
  volume: number;
  betCount?: number;
  theoreticalEdge?: number;
};

type OverviewData = {
  users: { total: number; recent: Array<{ id: string; email: string; name: string | null; credits: number; createdAt: string }> };
  bets: {
    totalCount: number;
    totalVolume: number;
    totalPayout: number;
    totalPnl: number;
    recent: Array<{
      id: string;
      userId: string;
      gameType: string;
      amount: number;
      outcome: string;
      payout: number;
      createdAt: string;
    }>;
  };
  faucet: { totalGrants: number; totalCredits: number };
  stripe: { totalEvents: number };
  strategies: { basic: number; advanced: number };
  creditsInCirculation: number;
  revenue?: {
    daily: RevenuePeriod;
    weekly: RevenuePeriod;
    monthly: RevenuePeriod;
    total: RevenuePeriod;
    houseEdgePercent: number;
  };
};

type Tab = "overview" | "games" | "users" | "withdrawals";

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [games, setGames] = useState<{
    bets: Array<{
      id: string;
      userId: string;
      userEmail: string | null;
      userName: string | null;
      gameType: string;
      amount: number;
      outcome: string;
      payout: number;
      pnl: number;
      createdAt: string;
    }>;
    totalCount: number;
    totalVolume: number;
    totalPnl: number;
    offset: number;
    limit: number;
  } | null>(null);
  const [usersData, setUsersData] = useState<{
    users: Array<{
      id: string;
      email: string;
      name: string | null;
      credits: number;
      betCount: number;
      totalVolume: number;
      totalPnl: number;
      createdAt: string;
    }>;
    totalCount: number;
    offset: number;
    limit: number;
  } | null>(null);
  const [withdrawalsData, setWithdrawalsData] = useState<{
    withdrawals: Array<{
      id: string;
      userId: string;
      userEmail: string;
      userName: string | null;
      amount: number;
      wiseEmail: string;
      fullName: string;
      currency: string;
      status: string;
      createdAt: string;
    }>;
    totalCount: number;
  } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAdmin() {
      try {
        const res = await fetch("/api/me");
        const json = await res.json();
        if (!json.success || !json.data?.isAdmin) {
          setIsAdmin(false);
          return;
        }
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    }
    checkAdmin();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    async function fetchOverview() {
      try {
        const res = await fetch("/api/admin/overview");
        const json = await res.json();
        if (json.success) setOverview(json.data);
        else setError(json.error ?? "Failed to load overview");
      } catch (e) {
        setError("Failed to load overview");
      }
    }
    fetchOverview();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || tab !== "games") return;
    async function fetchGames() {
      try {
        const res = await fetch("/api/admin/games?limit=100");
        const json = await res.json();
        if (json.success) setGames(json.data);
      } catch {
        setError("Failed to load games");
      }
    }
    fetchGames();
  }, [isAdmin, tab]);

  useEffect(() => {
    if (!isAdmin || tab !== "users") return;
    async function fetchUsers() {
      try {
        const res = await fetch("/api/admin/users?limit=100");
        const json = await res.json();
        if (json.success) setUsersData(json.data);
      } catch {
        setError("Failed to load users");
      }
    }
    fetchUsers();
  }, [isAdmin, tab]);

  useEffect(() => {
    if (!isAdmin || tab !== "withdrawals") return;
    async function fetchWithdrawals() {
      try {
        const res = await fetch("/api/admin/withdrawals?limit=100");
        const json = await res.json();
        if (json.success) setWithdrawalsData(json.data);
      } catch {
        setError("Failed to load withdrawals");
      }
    }
    fetchWithdrawals();
  }, [isAdmin, tab]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-heart)] border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="agent-card p-12 text-center max-w-md mx-auto">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Access Denied</h2>
        <p className="mt-2 text-[var(--text-secondary)] text-sm">
          Admin access requires signing in with your email and password. If you use &quot;Play&quot; or &quot;Continue as guest&quot;, you are not using your permanent account.
        </p>
        <p className="mt-3 text-[var(--text-secondary)] text-xs">
          Your email must be listed in <code className="bg-white/10 px-1.5 py-0.5 rounded">ADMIN_EMAILS</code> (in .env.local locally, or Vercel Environment Variables for production).
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/signin"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent-heart)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] px-6 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "games", label: "All Games" },
    { id: "users", label: "Users" },
    { id: "withdrawals", label: "Withdrawals" },
  ];

  return (
    <div className="space-y-8 animate-fade-in-up">
      <header>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 text-amber-400 border border-amber-500/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-gradient-primary">Admin Panel</h1>
            <p className="mt-1 text-[var(--text-secondary)]">Platform-wide metrics and game tracking</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border)] pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-all",
              tab === t.id
                ? "bg-[var(--accent-heart)]/20 text-[var(--accent-heart)]" 
                : "text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-white"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {tab === "overview" && overview && (
        <div className="space-y-8">
          {/* Revenue & Transaction Cost Section */}
          {overview.revenue && (
            <GlassCard className="p-6 border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400/90 mb-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Revenue & Transaction Cost ({overview.revenue.houseEdgePercent}%)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-amber-500/20 bg-black/20 p-4">
                  <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Today</p>
                  <p className={cn("mt-1 text-2xl font-semibold", overview.revenue.daily.earnings >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                    {overview.revenue.daily.earnings >= 0 ? "+" : ""}{overview.revenue.daily.earnings}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {overview.revenue.daily.volume.toLocaleString()} vol · {overview.revenue.daily.betCount ?? 0} bets
                  </p>
                  {overview.revenue.daily.theoreticalEdge != null && (
                    <p className="mt-1 text-[10px] text-amber-400/70">~{overview.revenue.daily.theoreticalEdge} theoretical (3%)</p>
                  )}
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-black/20 p-4">
                  <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">7 Days</p>
                  <p className={cn("mt-1 text-2xl font-semibold", overview.revenue.weekly.earnings >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                    {overview.revenue.weekly.earnings >= 0 ? "+" : ""}{overview.revenue.weekly.earnings}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {overview.revenue.weekly.volume.toLocaleString()} vol · {overview.revenue.weekly.betCount ?? 0} bets
                  </p>
                  {overview.revenue.weekly.theoreticalEdge != null && (
                    <p className="mt-1 text-[10px] text-amber-400/70">~{overview.revenue.weekly.theoreticalEdge} theoretical (3%)</p>
                  )}
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-black/20 p-4">
                  <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">30 Days</p>
                  <p className={cn("mt-1 text-2xl font-semibold", overview.revenue.monthly.earnings >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                    {overview.revenue.monthly.earnings >= 0 ? "+" : ""}{overview.revenue.monthly.earnings}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {overview.revenue.monthly.volume.toLocaleString()} vol · {overview.revenue.monthly.betCount ?? 0} bets
                  </p>
                  {overview.revenue.monthly.theoreticalEdge != null && (
                    <p className="mt-1 text-[10px] text-amber-400/70">~{overview.revenue.monthly.theoreticalEdge} theoretical (3%)</p>
                  )}
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-black/20 p-4">
                  <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">All Time</p>
                  <p className={cn("mt-1 text-2xl font-semibold", overview.revenue.total.earnings >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                    {overview.revenue.total.earnings >= 0 ? "+" : ""}{overview.revenue.total.earnings}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {overview.revenue.total.volume.toLocaleString()} total volume
                  </p>
                  {overview.revenue.total.theoreticalEdge != null && (
                    <p className="mt-1 text-[10px] text-amber-400/70">~{overview.revenue.total.theoreticalEdge} theoretical (3%)</p>
                  )}
                </div>
              </div>
            </GlassCard>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard label="Total Users" value={overview.users.total} />
            <MetricCard label="Total Bets" value={overview.bets.totalCount} />
            <MetricCard
              label="Total Volume"
              value={overview.bets.totalVolume.toLocaleString()}
              subtext="credits wagered"
            />
            <MetricCard
              label="Platform PnL"
              value={overview.bets.totalPnl}
              trend={overview.bets.totalPnl >= 0 ? "up" : "down"}
              subtext="credits"
            />
            <MetricCard label="Free Credit grants" value={overview.faucet.totalGrants} subtext={`${overview.faucet.totalCredits} credits`} />
            <MetricCard label="Credits in Circulation" value={overview.creditsInCirculation.toLocaleString()} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-4">Recent Bets</h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {overview.bets.recent.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">No bets yet</p>
                ) : (
                  overview.bets.recent.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-white/[0.02] px-4 py-2 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-[var(--text-tertiary)] truncate">{b.id.slice(0, 8)}</span>
                        <span className="text-[var(--text-secondary)]">{b.gameType}</span>
                        <span className="font-mono">{b.amount} credits</span>
                      </div>
                      <span className={cn("font-mono font-medium", b.outcome === "win" ? "text-[#30d158]" : "text-[#ff453a]")}>
                        {b.outcome === "win" ? "WIN" : "LOSS"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-4">Recent Users</h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {overview.users.recent.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">No users yet</p>
                ) : (
                  overview.users.recent.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-white/[0.02] px-4 py-2 text-sm"
                    >
                      <span className="truncate text-[var(--text-primary)]">{u.email}</span>
                      <span className="font-mono text-[var(--text-secondary)]">{u.credits} cr</span>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="Basic Strategies" value={overview.strategies.basic} />
            <MetricCard label="Advanced Strategies" value={overview.strategies.advanced} />
          </div>
        </div>
      )}

      {tab === "games" && games && (
        <GlassCard className="overflow-hidden p-0">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="font-semibold text-[var(--text-primary)]">All Bets ({games.totalCount})</h3>
            <span className="text-sm text-[var(--text-secondary)]">
              Volume: {games.totalVolume.toLocaleString()} · PnL: {games.totalPnl}
            </span>
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-[var(--text-secondary)] uppercase bg-white/[0.03] sticky top-0">
                <tr>
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Game</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Outcome</th>
                  <th className="px-6 py-3">Payout</th>
                  <th className="px-6 py-3">PnL</th>
                </tr>
              </thead>
              <tbody>
                {games.bets.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--border)] hover:bg-white/[0.02]">
                    <td className="px-6 py-3 font-mono text-xs text-[var(--text-tertiary)]">
                      {new Date(b.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 truncate max-w-[180px]" title={b.userEmail ?? b.userId}>
                      {b.userEmail ?? b.userName ?? b.userId.slice(0, 8)}
                    </td>
                    <td className="px-6 py-3">{b.gameType}</td>
                    <td className="px-6 py-3 font-mono">{b.amount}</td>
                    <td className="px-6 py-3">
                      <span className={cn("font-medium", b.outcome === "win" ? "text-[#30d158]" : "text-[#ff453a]")}>
                        {b.outcome}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono">{b.payout}</td>
                    <td className={cn("px-6 py-3 font-mono font-medium", b.pnl >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                      {b.pnl >= 0 ? "+" : ""}{b.pnl}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {tab === "withdrawals" && withdrawalsData && (
        <GlassCard className="overflow-hidden p-0">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="font-semibold text-[var(--text-primary)]">Withdrawal Requests ({withdrawalsData.totalCount})</h3>
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-[var(--text-secondary)] uppercase bg-white/[0.03] sticky top-0">
                <tr>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Currency</th>
                  <th className="px-6 py-3">Wise Email</th>
                  <th className="px-6 py-3">Full Name</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {withdrawalsData.withdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                      No withdrawal requests yet.
                    </td>
                  </tr>
                ) : (
                  withdrawalsData.withdrawals.map((w) => (
                    <tr key={w.id} className="border-b border-[var(--border)] hover:bg-white/[0.02]">
                      <td className="px-6 py-3 font-mono text-xs text-[var(--text-tertiary)]">
                        {new Date(w.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 truncate max-w-[180px]" title={w.userEmail}>
                        {w.userEmail}
                      </td>
                      <td className="px-6 py-3 font-mono">{w.amount.toLocaleString()}</td>
                      <td className="px-6 py-3">{w.currency}</td>
                      <td className="px-6 py-3 truncate max-w-[160px]" title={w.wiseEmail}>
                        {w.wiseEmail}
                      </td>
                      <td className="px-6 py-3 truncate max-w-[140px]" title={w.fullName}>
                        {w.fullName}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={cn(
                            "font-medium px-2 py-0.5 rounded",
                            w.status === "pending" && "bg-amber-500/20 text-amber-400",
                            w.status === "processing" && "bg-blue-500/20 text-blue-400",
                            w.status === "completed" && "bg-[#30d158]/20 text-[#30d158]",
                            w.status === "failed" && "bg-red-500/20 text-red-400"
                          )}
                        >
                          {w.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {tab === "users" && usersData && (
        <GlassCard className="overflow-hidden p-0">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="font-semibold text-[var(--text-primary)]">All Users ({usersData.totalCount})</h3>
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-[var(--text-secondary)] uppercase bg-white/[0.03] sticky top-0">
                <tr>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Credits</th>
                  <th className="px-6 py-3">Bets</th>
                  <th className="px-6 py-3">Volume</th>
                  <th className="px-6 py-3">PnL</th>
                  <th className="px-6 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {usersData.users.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--border)] hover:bg-white/[0.02]">
                    <td className="px-6 py-3 truncate max-w-[220px]" title={u.email}>
                      {u.email}
                    </td>
                    <td className="px-6 py-3 font-mono">{u.credits}</td>
                    <td className="px-6 py-3 font-mono">{u.betCount}</td>
                    <td className="px-6 py-3 font-mono">{u.totalVolume.toLocaleString()}</td>
                    <td className={cn("px-6 py-3 font-mono font-medium", u.totalPnl >= 0 ? "text-[#30d158]" : "text-[#ff453a]")}>
                      {u.totalPnl >= 0 ? "+" : ""}{u.totalPnl}
                    </td>
                    <td className="px-6 py-3 text-[var(--text-tertiary)]">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
