"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TradingErrorBanner } from "@/components/trading/TradingErrorBanner";

interface AdvancedStrategy {
  id: string;
  name: string;
  description: string | null;
}

export default function ListStrategyPage() {
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("selectedId");
  const [strategies, setStrategies] = useState<AdvancedStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceMonthlyCents, setPriceMonthlyCents] = useState(4999);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/advanced-strategies", { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        const list = res.data?.strategies ?? res.data;
        if (res.success && Array.isArray(list)) {
          setStrategies(list);
          const preselected = preselectedId && list.find((s: AdvancedStrategy) => s.id === preselectedId);
          const first = preselected ?? list[0];
          if (first) {
            setSelectedId(first.id);
            setName(first.name);
            setDescription(first.description ?? "");
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [preselectedId]);

  useEffect(() => {
    const s = strategies.find((x) => x.id === selectedId);
    if (s) {
      setName(s.name);
      setDescription(s.description ?? "");
    }
  }, [selectedId, strategies]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/trading/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          advancedStrategyId: selectedId,
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          priceMonthlyCents,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.id) {
        window.location.href = `/trading/developer/strategy/${data.data.id}/edit`;
        return;
      }
      setError(data.message ?? "Failed to list strategy");
    } catch (e) {
      setError("Failed to list strategy");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">List a strategy</h1>
        <p className="text-[var(--dash-text-secondary)]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {error && (
        <TradingErrorBanner message={error} onDismiss={() => setError(null)} />
      )}
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">List a strategy</h1>
        <p className="mt-1 text-sm text-[var(--dash-text-secondary)]">
          Select one of your advanced strategies and set a price. Min $9.99, max $999/mo.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="agent-card p-6 border-[var(--dash-divider)] space-y-6 max-w-lg">
        {strategies.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--dash-text-secondary)]">
              You have no advanced strategies. Create one in the Strategies section first.
            </p>
            <Link
              href="/dashboard/strategies"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#0ea5e9] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9]/50 rounded"
            >
              Go to Strategies
            </Link>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Strategy</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-xl border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#30d158]/50 focus:border-[#30d158]/50"
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Listing name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="w-full rounded-xl border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#30d158]/50 focus:border-[#30d158]/50"
                placeholder="e.g. AlphaBreak Martingale"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#30d158]/50 focus:border-[#30d158]/50"
                placeholder="Brief description for the marketplace"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Price per month</label>
              <div className="flex items-center gap-2">
                <span className="text-[var(--dash-text-secondary)]">$</span>
                <input
                  type="number"
                  min={9.99}
                  max={999}
                  step={0.01}
                  value={(priceMonthlyCents / 100).toFixed(2)}
                  onChange={(e) => setPriceMonthlyCents(Math.round(parseFloat(e.target.value || "0") * 100))}
                  className="w-32 rounded-xl border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#30d158]/50 focus:border-[#30d158]/50"
                />
                <span className="text-[var(--dash-text-secondary)]">/mo</span>
              </div>
              <p className="mt-1 text-xs text-[var(--dash-text-secondary)]">$9.99 – $999</p>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-6 py-3 text-sm font-semibold text-white hover:bg-[#30d158]/90 disabled:opacity-50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
            >
              {submitting ? "Listing…" : "List strategy"}
            </button>
          </>
        )}
      </form>

      <Link href="/trading/developer" className="text-sm text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 rounded">
        ← Back to Developer Dashboard
      </Link>
    </div>
  );
}
