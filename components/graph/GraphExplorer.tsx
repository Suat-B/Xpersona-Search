"use client";

import { useState } from "react";
import { apiV1 } from "@/lib/api/url";

const DEFAULT_TASK = "Research Tesla stock and summarize risks";

export function GraphExplorer() {
  const [task, setTask] = useState(DEFAULT_TASK);
  const [budget, setBudget] = useState(10);
  const [maxLatencyMs, setMaxLatencyMs] = useState(12000);
  const [recommendResult, setRecommendResult] = useState<string | null>(null);
  const [planResult, setPlanResult] = useState<string | null>(null);
  const [loading, setLoading] = useState<"recommend" | "plan" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runRecommend() {
    setLoading("recommend");
    setError(null);
    try {
      const params = new URLSearchParams({
        task,
        budget: String(budget),
        maxLatencyMs: String(maxLatencyMs),
      });
      const res = await fetch(apiV1(`/gpg/recommend?${params.toString()}`));
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setRecommendResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(null);
    }
  }

  async function runPlan() {
    setLoading("plan");
    setError(null);
    try {
      const res = await fetch(apiV1("/gpg/plan"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          constraints: {
            budget,
            maxLatencyMs,
          },
          preferences: { optimizeFor: "success_then_cost" },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setPlanResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rounded-3xl border border-white/[0.08] bg-black/40 p-6 sm:p-10 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
        <div className="flex flex-col gap-3">
          <div className="inline-flex items-center rounded-full border border-white/[0.12] bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            Global Performance Graph
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">GPG Live Console</h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-3xl">
            Query the performance graph, get agent recommendations, and preview pipeline plans.
          </p>
        </div>

        <div className="mt-8 grid gap-6">
          <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-5 sm:p-8">
            <div className="grid gap-4">
              <label className="text-xs uppercase tracking-widest text-[var(--text-tertiary)]">Task</label>
              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/40"
              />
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-xs uppercase tracking-widest text-[var(--text-tertiary)]">
                Budget (USD)
                <input
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/40 px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/40"
                />
              </label>
              <label className="text-xs uppercase tracking-widest text-[var(--text-tertiary)]">
                Max Latency (ms)
                <input
                  type="number"
                  min={1000}
                  value={maxLatencyMs}
                  onChange={(e) => setMaxLatencyMs(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/40 px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/40"
                />
              </label>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={runRecommend}
                disabled={loading !== null}
                className="rounded-xl bg-[var(--accent-heart)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-heart)]/20 disabled:opacity-60"
              >
                {loading === "recommend" ? "Running..." : "Recommend Agents"}
              </button>
              <button
                type="button"
                onClick={runPlan}
                disabled={loading !== null}
                className="rounded-xl border border-white/[0.12] bg-white/5 px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:border-white/[0.2] disabled:opacity-60"
              >
                {loading === "plan" ? "Planning..." : "Plan Pipeline"}
              </button>
            </div>
            {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recommend Response</h2>
              <pre className="max-h-[320px] overflow-auto rounded-xl bg-black/50 p-4 text-xs text-[var(--text-secondary)]">
{recommendResult ?? "Run a recommendation to see output."}
              </pre>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Plan Response</h2>
              <pre className="max-h-[320px] overflow-auto rounded-xl bg-black/50 p-4 text-xs text-[var(--text-secondary)]">
{planResult ?? "Run a plan to see output."}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
