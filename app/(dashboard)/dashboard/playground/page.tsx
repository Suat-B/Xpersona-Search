"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type RequestStatus = "success" | "error" | "rate_limited" | "quota_exceeded" | "validation_error";

interface PlaygroundUsageData {
  plan: "trial" | "paid" | null;
  status: "active" | "trial" | "cancelled" | "past_due" | "inactive";
  trial: { endsAt: string; isActive: boolean } | null;
  billing: { currentPeriodEndsAt: string; cancelAtPeriodEnd: boolean } | null;
  limits: {
    contextCap: number;
    maxOutputTokens: number;
    maxRequestsPerDay: number;
    maxOutputTokensPerMonth: number;
  } | null;
  today: {
    requestsUsed: number;
    requestsRemaining: number;
    requestsLimit: number;
  };
  thisMonth: {
    tokensOutput: number;
    tokensRemaining: number;
    tokensLimit: number;
    estimatedCostUsd: number;
  };
  last24h: {
    requests: number;
    tokensOutput: number;
    estimatedCostUsd: number;
    successRate: number;
    avgLatencyMs: number | null;
  };
  statusBreakdown: {
    success: number;
    error: number;
    rateLimited: number;
    quotaExceeded: number;
    validationError: number;
  };
  topModels: Array<{
    model: string;
    requests: number;
    tokensOutput: number;
  }>;
  recentRequests: Array<{
    id: string;
    createdAt: string;
    model: string;
    provider: string;
    status: RequestStatus;
    tokensInput: number;
    tokensOutput: number;
    latencyMs: number | null;
    estimatedCostUsd: number | null;
    errorMessage: string | null;
  }>;
  nextResetAt: string;
}

function pct(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, (used / limit) * 100));
}

function statusPill(status: RequestStatus): string {
  if (status === "success") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (status === "rate_limited") return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  if (status === "quota_exceeded") return "bg-orange-500/15 text-orange-300 border-orange-500/40";
  if (status === "validation_error") return "bg-sky-500/15 text-sky-300 border-sky-500/40";
  return "bg-rose-500/15 text-rose-300 border-rose-500/40";
}

function friendlyStatus(status: RequestStatus): string {
  return status.replaceAll("_", " ");
}

export default function PlaygroundDashboardPage() {
  const [data, setData] = useState<PlaygroundUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/playground-usage", { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        setError(res.status === 401 ? "Please sign in to view your Playground subscription." : "Failed to load Playground usage.");
        return;
      }
      const json = (await res.json()) as PlaygroundUsageData;
      setData(json);
      setError(null);
    } catch {
      setError("Network error while loading Playground usage.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const requestPct = pct(data?.today.requestsUsed ?? 0, data?.today.requestsLimit ?? 1);
  const tokenPct = pct(data?.thisMonth.tokensOutput ?? 0, data?.thisMonth.tokensLimit ?? 1);
  const hasSubscription = Boolean(data?.plan);

  const statusTotal = useMemo(() => {
    if (!data) return 0;
    const s = data.statusBreakdown;
    return s.success + s.error + s.rateLimited + s.quotaExceeded + s.validationError;
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 rounded-2xl bg-white/[0.04] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-white/[0.04] animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="agent-card p-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">{error ?? "Unable to load Playground details."}</p>
        <button
          onClick={load}
          className="mt-3 inline-flex items-center rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-white/[0.04]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/25 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.22),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.18),transparent_55%),linear-gradient(145deg,rgba(9,14,24,0.98),rgba(10,18,30,0.96))] p-6 sm:p-8">
        <div className="absolute -right-12 -top-10 h-44 w-44 rounded-full bg-cyan-400/15 blur-3xl" aria-hidden />
        <div className="absolute -left-16 -bottom-14 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-200/80">Playground AI Subscription</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white font-display">Quota and Usage Monitor</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Monitor plan limits, request health, token consumption, and recent HF router activity.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
              Plan: {data.plan ? data.plan.toUpperCase() : "NONE"}
            </span>
            <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-100">
              Status: {data.status.replaceAll("_", " ")}
            </span>
            {data.trial?.isActive && (
              <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-100">
                Trial ends {new Date(data.trial.endsAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Daily requests</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
            {data.today.requestsUsed.toLocaleString()} / {data.today.requestsLimit.toLocaleString()}
          </p>
          <div className="mt-3 h-2.5 rounded-full bg-slate-700/40 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-all duration-500" style={{ width: `${requestPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">{data.today.requestsRemaining.toLocaleString()} remaining before reset</p>
        </div>
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Monthly output tokens</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
            {data.thisMonth.tokensOutput.toLocaleString()} / {data.thisMonth.tokensLimit.toLocaleString()}
          </p>
          <div className="mt-3 h-2.5 rounded-full bg-slate-700/40 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500" style={{ width: `${tokenPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">{data.thisMonth.tokensRemaining.toLocaleString()} tokens remaining this month</p>
        </div>
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Context cap</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
            {data.limits?.contextCap.toLocaleString() ?? "0"}
          </p>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">Max input tokens accepted per request</p>
        </div>
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Max output / request</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
            {data.limits?.maxOutputTokens.toLocaleString() ?? "0"}
          </p>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Est. monthly HF cost ${data.thisMonth.estimatedCostUsd.toFixed(4)}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="agent-card p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Last 24 hours</h2>
            <span className="text-xs text-[var(--text-tertiary)]">
              Reset at {new Date(data.nextResetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <p className="text-xs text-[var(--text-tertiary)]">Requests</p>
              <p className="text-xl font-semibold tabular-nums text-[var(--text-primary)]">{data.last24h.requests.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <p className="text-xs text-[var(--text-tertiary)]">Success rate</p>
              <p className="text-xl font-semibold tabular-nums text-emerald-300">{(data.last24h.successRate * 100).toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <p className="text-xs text-[var(--text-tertiary)]">Avg latency</p>
              <p className="text-xl font-semibold tabular-nums text-[var(--text-primary)]">
                {data.last24h.avgLatencyMs == null ? "-" : `${Math.round(data.last24h.avgLatencyMs)} ms`}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <p className="text-xs text-[var(--text-tertiary)]">24h output tokens</p>
              <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{data.last24h.tokensOutput.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <p className="text-xs text-[var(--text-tertiary)]">24h estimated cost</p>
              <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">${data.last24h.estimatedCostUsd.toFixed(4)}</p>
            </div>
          </div>
        </div>

        <div className="agent-card p-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Request outcomes</h2>
          <div className="mt-4 space-y-3">
            {[
              { key: "success", label: "Success", value: data.statusBreakdown.success, tone: "bg-emerald-400" },
              { key: "error", label: "Error", value: data.statusBreakdown.error, tone: "bg-rose-400" },
              { key: "rateLimited", label: "Rate limited", value: data.statusBreakdown.rateLimited, tone: "bg-amber-400" },
              { key: "quotaExceeded", label: "Quota exceeded", value: data.statusBreakdown.quotaExceeded, tone: "bg-orange-400" },
              { key: "validationError", label: "Validation error", value: data.statusBreakdown.validationError, tone: "bg-sky-400" },
            ].map((item) => {
              const ratio = statusTotal > 0 ? (item.value / statusTotal) * 100 : 0;
              return (
                <div key={item.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">{item.label}</span>
                    <span className="tabular-nums text-[var(--text-primary)]">{item.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-700/40">
                    <div className={`h-full ${item.tone}`} style={{ width: `${ratio}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="agent-card p-5 xl:col-span-2 overflow-x-auto">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Recent requests</h2>
            <span className="text-xs text-[var(--text-tertiary)]">Latest 12 requests</span>
          </div>
          <table className="mt-4 w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
                <th className="pb-2 font-medium">Time</th>
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">In</th>
                <th className="pb-2 font-medium">Out</th>
                <th className="pb-2 font-medium">Latency</th>
                <th className="pb-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRequests.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-5 text-center text-sm text-[var(--text-tertiary)]">
                    No usage yet. Your request history will appear here.
                  </td>
                </tr>
              )}
              {data.recentRequests.map((req) => (
                <tr key={req.id} className="border-t border-[var(--dash-divider)]">
                  <td className="py-2.5 text-[var(--text-tertiary)]">{new Date(req.createdAt).toLocaleString()}</td>
                  <td className="py-2.5">
                    <span className="font-mono text-xs text-[var(--text-primary)]">{req.model}</span>
                  </td>
                  <td className="py-2.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusPill(req.status)}`}>
                      {friendlyStatus(req.status)}
                    </span>
                  </td>
                  <td className="py-2.5 tabular-nums text-[var(--text-primary)]">{req.tokensInput.toLocaleString()}</td>
                  <td className="py-2.5 tabular-nums text-[var(--text-primary)]">{req.tokensOutput.toLocaleString()}</td>
                  <td className="py-2.5 tabular-nums text-[var(--text-tertiary)]">{req.latencyMs == null ? "-" : `${req.latencyMs} ms`}</td>
                  <td className="py-2.5 tabular-nums text-[var(--text-tertiary)]">{req.estimatedCostUsd == null ? "-" : `$${req.estimatedCostUsd.toFixed(4)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="agent-card p-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Top models this month</h2>
          <div className="mt-4 space-y-3">
            {data.topModels.length === 0 && (
              <p className="text-sm text-[var(--text-tertiary)]">No model usage data yet.</p>
            )}
            {data.topModels.map((m) => {
              const modelPeak = Math.max(...data.topModels.map((r) => r.requests), 1);
              const width = (m.requests / modelPeak) * 100;
              return (
                <div key={m.model}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-xs text-[var(--text-primary)]">{m.model}</span>
                    <span className="text-xs tabular-nums text-[var(--text-tertiary)]">{m.requests.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-700/40">
                    <div className="h-full bg-gradient-to-r from-cyan-400 to-amber-400" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="agent-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Plan reference</h2>
            <p className="text-sm text-[var(--text-tertiary)]">
              Limits based on the HF router implementation: trial vs paid plan quotas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/playground" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-white/[0.04]">
              Open Playground
            </Link>
            {hasSubscription ? (
              <Link href="/dashboard/connect-ai" className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500/90">
                Manage API Key
              </Link>
            ) : (
              <Link href="/playground" className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400">
                Start Trial
              </Link>
            )}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
                <th className="pb-2">Plan</th>
                <th className="pb-2">Daily requests</th>
                <th className="pb-2">Context cap</th>
                <th className="pb-2">Max output / request</th>
                <th className="pb-2">Monthly output cap</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--dash-divider)]">
                <td className="py-2.5 text-[var(--text-primary)]">Trial (2-day)</td>
                <td className="py-2.5 tabular-nums text-[var(--text-primary)]">30</td>
                <td className="py-2.5 tabular-nums text-[var(--text-primary)]">8,192</td>
                <td className="py-2.5 tabular-nums text-[var(--text-primary)]">256</td>
                <td className="py-2.5 tabular-nums text-[var(--text-primary)]">50,000</td>
              </tr>
              <tr className="border-t border-[var(--dash-divider)]">
                <td className="py-2.5 text-[var(--text-primary)]">Paid ($3/month)</td>
                <td className="py-2.5 tabular-nums text-[var(--text-primary)]">100</td>
                <td className="py-2.5 tabular-nums text-[var(--text-primary)]">16,384</td>
                <td className="py-2.5 tabular-nums text-[var(--text-primary)]">512</td>
                <td className="py-2.5 tabular-nums text-[var(--text-primary)]">300,000</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
