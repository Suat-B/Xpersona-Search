"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface StrategyData {
  id: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number | null;
  isActive: boolean;
}

export default function EditStrategyPage() {
  const params = useParams();
  const id = params?.id as string;
  const [strategy, setStrategy] = useState<StrategyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceMonthlyCents, setPriceMonthlyCents] = useState(4999);
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/trading/strategies/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const d = res.data;
          setStrategy(d);
          setName(d.name);
          setDescription(d.description ?? "");
          setPriceMonthlyCents(d.priceMonthlyCents);
          setIsActive(d.isActive ?? false);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/trading/strategies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          priceMonthlyCents,
          isActive,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStrategy((s) => s ? { ...s, name, description, priceMonthlyCents, isActive } : null);
      } else {
        setError(data.message ?? "Failed to save");
      }
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Edit strategy</h1>
        <p className="text-[var(--dash-text-secondary)]">Loading…</p>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Strategy not found</h1>
        <Link href="/trading/developer" className="text-sm text-[#30d158] hover:underline">
          Back to Developer Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Edit strategy</h1>
        <p className="mt-1 text-sm text-[var(--dash-text-secondary)]">
          Update name, description, price, or toggle active status.
        </p>
      </header>

      <form onSubmit={handleSave} className="agent-card p-6 border-[var(--dash-divider)] space-y-6 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="w-full rounded-xl border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-4 py-3 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-4 py-3 text-[var(--text-primary)]"
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
              className="w-32 rounded-xl border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-4 py-3 text-[var(--text-primary)]"
            />
            <span className="text-[var(--dash-text-secondary)]">/mo</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-[var(--dash-divider)]"
          />
          <label htmlFor="isActive" className="text-sm font-medium text-[var(--text-primary)]">
            Active (visible on marketplace)
          </label>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-6 py-3 text-sm font-semibold text-white hover:bg-[#30d158]/90 disabled:opacity-50 transition-all"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <Link href="/trading/developer" className="text-sm text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors">
        ← Back to Developer Dashboard
      </Link>
    </div>
  );
}
