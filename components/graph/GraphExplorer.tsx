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

  const recommendCurl = `curl -s "http://localhost:3000/api/v1/gpg/recommend?task=${encodeURIComponent(
    task
  )}&budget=${budget}&maxLatencyMs=${maxLatencyMs}"`;
  const planBody = JSON.stringify(
    {
      task,
      constraints: { budget, maxLatencyMs },
      preferences: { optimizeFor: "success_then_cost" },
    },
    null,
    2
  );
  const planCurl = `curl -s -X POST http://localhost:3000/api/v1/gpg/plan -H "Content-Type: application/json" -d '${planBody.replace(
    /\n/g,
    "\n"
  )}'`;

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
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-8 overflow-hidden backdrop-blur-sm">
      <div className="flex flex-col gap-4">
        <div className="inline-flex items-center self-start rounded-full border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--accent-heart)]">
          GPG Live Console
        </div>
        <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">Query the Global Performance Graph</h2>
        <p className="text-base text-[var(--text-secondary)] max-w-3xl leading-relaxed">
          Query the performance graph, get agent recommendations, and preview pipeline plans.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-5 group hover:border-[var(--accent-heart)]/30 transition-colors">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-3">Agent UX</p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed group-hover:text-white transition-colors">
            Deterministic inputs, predictable outputs. This console is optimized for autonomous
            agents that need repeatable planning.
          </p>
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-white/5 p-3 text-[11px] text-[var(--accent-heart)] font-medium">
            Suggested loop: recommend, plan, execute, report.
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-5 group hover:border-[var(--accent-heart)]/30 transition-colors">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-3">Recommend (GET)</p>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">Machine-callable query.</p>
          <pre className="w-full max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[var(--border)] bg-black/60 p-3 text-[10px] text-[var(--accent-heart)] font-mono">
            {recommendCurl}
          </pre>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-5 group hover:border-[var(--accent-heart)]/30 transition-colors">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-3">Plan (POST)</p>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">Full pipeline planning payload.</p>
          <pre className="w-full max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[var(--border)] bg-black/60 p-3 text-[10px] text-[var(--accent-heart)] font-mono">
            {planCurl}
          </pre>
        </div>
      </div>

      <div className="mt-8 grid gap-8">
        <div className="rounded-3xl border border-[var(--border)] bg-black/60 p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-heart)]">Task Objective</label>
              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                rows={3}
                placeholder="Describe what the agent should do..."
                className="w-full rounded-2xl border border-[var(--border)] bg-black px-4 py-4 text-sm text-white placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-heart)]/50 focus:border-[var(--accent-heart)]/50 transition-all font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-2">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-heart)]">Budget Constraint (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">$</span>
                  <input
                    type="number"
                    min={0}
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="w-full rounded-2xl border border-[var(--border)] bg-black pl-8 pr-4 py-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent-heart)]/50 focus:border-[var(--accent-heart)]/50 transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-heart)]">Max Latency (ms)</label>
                <div className="relative">
                  <input
                    type="number"
                    min={1000}
                    value={maxLatencyMs}
                    onChange={(e) => setMaxLatencyMs(Number(e.target.value))}
                    className="w-full rounded-2xl border border-[var(--border)] bg-black px-4 py-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent-heart)]/50 focus:border-[var(--accent-heart)]/50 transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs">ms</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={runRecommend}
              disabled={loading != null}
              className="rounded-full bg-white px-8 py-3 text-sm font-bold text-black hover:bg-white/90 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading == "recommend" ? "Running Analysis..." : "Recommend Agents"}
            </button>
            <button
              type="button"
              onClick={runPlan}
              disabled={loading != null}
              className="rounded-full border border-[var(--border)] bg-white/5 px-8 py-3 text-sm font-bold text-white hover:bg-white hover:text-black active:scale-95 transition-all disabled:opacity-50"
            >
              {loading == "plan" ? "Synthesizing Plan..." : "Plan Pipeline"}
            </button>
          </div>
          {error && <p className="mt-6 text-sm text-[var(--accent-danger)] font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-danger)] shadow-[0_0_5px_var(--accent-danger)]" />
            {error}
          </p>}
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mt-4">
          <div className="rounded-3xl border border-[var(--border)] bg-black/40 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em]">Recommend Response</h2>
              <div className="w-2 h-2 rounded-full bg-[var(--accent-heart)]/20" />
            </div>
            <pre className="max-h-[350px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-[var(--border)] bg-black/60 p-5 text-[11px] font-mono text-[var(--text-primary)] leading-relaxed scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent">
              {recommendResult ?? "// Run a recommendation to see output."}
            </pre>
          </div>
          <div className="rounded-3xl border border-[var(--border)] bg-black/40 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em]">Plan Response</h2>
              <div className="w-2 h-2 rounded-full bg-[var(--accent-heart)]/20" />
            </div>
            <pre className="max-h-[350px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-[var(--border)] bg-black/60 p-5 text-[11px] font-mono text-[var(--text-primary)] leading-relaxed scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent">
              {planResult ?? "// Run a plan to see output."}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
