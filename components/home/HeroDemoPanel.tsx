"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DemoResult = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  protocols: string[];
  safetyScore: number | null;
  overallRank: number | null;
};

const TABS = ["Main", "Capabilities", "Protocols", "Trust"] as const;
const FILTERS = ["MCP", "A2A", "OpenClaw"] as const;
const CAPABILITY_CHIPS = ["Search", "Route", "Verify", "Execute"] as const;
const TRUST_CHIPS = ["Verified", "Benchmarked", "Community"] as const;
const PROTOCOL_ALIASES = new Map([
  ["OPENCLEW", "OPENCLAW"],
  ["OPENCLAW", "OPENCLAW"],
]);

export default function HeroDemoPanel({ query = "mcp pdf" }: { query?: string }) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Main");
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<DemoResult[]>([]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("q", query);
        params.set("limit", "10");
        const res = await fetch(`/api/v1/search?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = await res.json();
        if (!res.ok) throw new Error("Search failed");
        const next = (payload?.data?.results ?? payload?.results ?? []) as DemoResult[];
        if (mounted) setResults(next.slice(0, 10));
      } catch {
        if (mounted) setResults([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [query]);

  const pills = useMemo(() => {
    const chips =
      activeTab === "Capabilities"
        ? CAPABILITY_CHIPS
        : activeTab === "Protocols"
        ? FILTERS
        : activeTab === "Trust"
        ? TRUST_CHIPS
        : FILTERS;
    return chips.map((label) => (
      <span
        key={label}
        className="rounded-full border border-[var(--accent-heart)]/24 bg-[var(--accent-heart)]/12 px-2.5 py-1 text-[11px] font-medium text-white/85"
      >
        {label}
      </span>
    ));
  }, [activeTab]);

  const viewResults = useMemo(() => {
    if (activeTab === "Protocols") {
      const allowed = new Set(
        FILTERS.map((item) => item.toUpperCase()).map((item) => PROTOCOL_ALIASES.get(item) ?? item)
      );
      return results.filter((item) =>
        (item.protocols ?? []).some((protocol) => {
          const normalized = protocol.trim().toUpperCase();
          return allowed.has(PROTOCOL_ALIASES.get(normalized) ?? normalized);
        })
      );
    }
    if (activeTab === "Trust") {
      return [...results].sort((a, b) => (b.safetyScore ?? -1) - (a.safetyScore ?? -1));
    }
    if (activeTab === "Capabilities") {
      return [...results].sort((a, b) => a.name.localeCompare(b.name));
    }
    return results;
  }, [activeTab, results]);

  return (
    <div className="w-full overflow-hidden rounded-[24px] border border-[var(--accent-heart)]/28 bg-gradient-to-br from-[#0ea5e9] via-[#14b8a6] to-[#22c55e] shadow-[0_24px_90px_rgba(4,20,38,0.62)] ring-1 ring-[var(--accent-heart)]/12 sm:rounded-[28px]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--accent-heart)]/20 bg-[#07111b]/78 px-4 py-3">
        <div className="flex items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                activeTab === tab
                  ? "bg-[var(--accent-heart)] text-[#031523]"
                  : "text-white/70 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <span className="hidden text-[11px] text-white/50 sm:inline">Query: {query}</span>
      </div>

      <div className="flex flex-wrap gap-2 bg-[#07131f]/44 px-4 py-3">{pills}</div>

      <div className="border-t border-[var(--accent-heart)]/18 px-4 py-3">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/45">
          {activeTab === "Trust"
            ? "Trust Signals"
            : activeTab === "Protocols"
            ? "Protocol Matches"
            : activeTab === "Capabilities"
            ? "Capability Signals"
            : "Live Results"}
        </div>
        <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
          {loading
            ? Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`sk-${idx}`}
                  className="animate-pulse rounded-xl border border-[var(--accent-heart)]/20 bg-[var(--accent-heart)]/10 px-3 py-2"
                >
                  <div className="h-3 w-32 bg-white/20 rounded mb-2" />
                  <div className="h-3 w-full bg-white/10 rounded mb-1" />
                  <div className="h-3 w-2/3 bg-white/10 rounded" />
                </div>
              ))
              : viewResults.map((item) => (
                <Link
                  key={item.id}
                  href={`/agent/${item.slug}`}
                  className="block rounded-xl border border-[var(--accent-heart)]/16 bg-[#0a1723]/76 px-3 py-2 transition hover:border-[var(--accent-heart)]/28 hover:bg-[#0d1c2a]/88"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{item.name}</div>
                    <div className="text-[11px] text-white/50">
                      {item.overallRank ? `Rank ${item.overallRank.toFixed(0)}` : "Rank -"}
                    </div>
                  </div>
                  <div className="mt-1 text-[12px] text-white/60 line-clamp-2">
                    {item.description ?? "No description available yet."}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
                    <span>{item.protocols?.join(", ") || "Protocols -"}</span>
                    <span>
                      {typeof item.safetyScore === "number"
                        ? `Trust ${item.safetyScore.toFixed(0)}`
                        : "Trust -"}
                    </span>
                  </div>
                </Link>
              ))}
          {!loading && results.length === 0 && (
            <div className="rounded-xl border border-[var(--accent-heart)]/16 bg-[#0a1723]/76 px-3 py-4 text-sm text-white/65">
              No results yet. Try a different query.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
