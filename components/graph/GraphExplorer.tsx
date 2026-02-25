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
    <section className="rounded-2xl border border-white bg-black p-4 sm:p-8 min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3">
        <div className="inline-flex items-center rounded-full border border-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
          GPG Live Console
        </div>
        <h2 className="text-xl sm:text-3xl font-semibold text-white">Query the Global Performance Graph</h2>
        <p className="text-sm text-white max-w-3xl">
          Query the performance graph, get agent recommendations, and preview pipeline plans.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3 min-w-0">
        <div className="rounded-2xl border border-white bg-black p-3 sm:p-4 min-w-0 w-full">
          <p className="text-xs uppercase tracking-[0.2em] text-white">Agent UX</p>
          <p className="mt-2 text-sm text-white">
            Deterministic inputs, predictable outputs. This console is optimized for autonomous
            agents that need repeatable planning.
          </p>
          <div className="mt-3 rounded-lg border border-white p-2.5 sm:p-3 text-[10px] sm:text-[11px] text-white">
            Suggested loop: recommend, plan, execute, report outcomes.
          </div>
        </div>
        <div className="rounded-2xl border border-white bg-black p-3 sm:p-4 min-w-0 w-full">
          <p className="text-xs uppercase tracking-[0.16em] sm:tracking-[0.2em] text-white">Recommend (GET)</p>
          <p className="mt-2 text-xs text-white">Machine-callable query.</p>
          <pre className="mt-3 w-full max-w-full max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white bg-black p-2.5 sm:p-3 text-[10px] sm:text-[11px] text-white">
            {recommendCurl}
          </pre>
        </div>
        <div className="rounded-2xl border border-white bg-black p-3 sm:p-4 min-w-0 w-full">
          <p className="text-xs uppercase tracking-[0.16em] sm:tracking-[0.2em] text-white">Plan (POST)</p>
          <p className="mt-2 text-xs text-white">Full pipeline planning payload.</p>
          <pre className="mt-3 w-full max-w-full max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white bg-black p-2.5 sm:p-3 text-[10px] sm:text-[11px] text-white">
            {planCurl}
          </pre>
        </div>
      </div>

      <div className="mt-8 grid gap-6">
        <div className="rounded-2xl border border-white bg-black p-4 sm:p-8 min-w-0">
          <div className="grid gap-4">
            <label className="text-xs uppercase tracking-widest text-white">Task</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={3}
            className="w-full rounded-xl border border-white bg-black px-3 sm:px-4 py-2.5 sm:py-3 text-sm text-white focus:outline-none focus:border-white"
            />
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs uppercase tracking-widest text-white">
              Budget (USD)
              <input
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="mt-2 w-full rounded-xl border border-white bg-black px-3 sm:px-4 py-2.5 sm:py-3 text-sm text-white focus:outline-none focus:border-white"
              />
            </label>
            <label className="text-xs uppercase tracking-widest text-white">
              Max Latency (ms)
              <input
                type="number"
                min={1000}
                value={maxLatencyMs}
                onChange={(e) => setMaxLatencyMs(Number(e.target.value))}
                className="mt-2 w-full rounded-xl border border-white bg-black px-3 sm:px-4 py-2.5 sm:py-3 text-sm text-white focus:outline-none focus:border-white"
              />
            </label>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={runRecommend}
              disabled={loading != null}
              className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-black hover:text-white border border-white transition-colors disabled:opacity-60"
            >
              {loading == "recommend" ? "Running..." : "Recommend Agents"}
            </button>
            <button
              type="button"
              onClick={runPlan}
              disabled={loading != null}
              className="rounded-xl border border-white bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-white hover:text-black transition-colors disabled:opacity-60"
            >
              {loading == "plan" ? "Planning..." : "Plan Pipeline"}
            </button>
          </div>
          {error && <p className="mt-4 text-sm text-white">{error}</p>}
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white bg-black p-4 sm:p-6 min-w-0">
            <h2 className="text-sm font-semibold text-white mb-3">Recommend Response</h2>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white bg-black p-3 sm:p-4 text-[11px] sm:text-xs text-white">
{recommendResult ?? "Run a recommendation to see output."}
            </pre>
          </div>
          <div className="rounded-2xl border border-white bg-black p-4 sm:p-6 min-w-0">
            <h2 className="text-sm font-semibold text-white mb-3">Plan Response</h2>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white bg-black p-3 sm:p-4 text-[11px] sm:text-xs text-white">
{planResult ?? "Run a plan to see output."}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
