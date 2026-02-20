"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface EmbedStrategy {
  id: string;
  name: string;
  priceMonthlyCents: number;
  isActive: boolean;
  developerName: string;
}

/**
 * Embeddable strategy widget for external sites.
 * Usage: <iframe src="https://xpersona.co/embed/strategy/[ID]" width="280" height="120" ... />
 */
export default function EmbedStrategyPage() {
  const params = useParams();
  const id = params?.id as string;
  const [strategy, setStrategy] = useState<EmbedStrategy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/trading/strategies/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setStrategy({
            id: res.data.id,
            name: res.data.name,
            priceMonthlyCents: res.data.priceMonthlyCents,
            isActive: res.data.isActive,
            developerName: res.data.developerName ?? "Developer",
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://xpersona.co";

  if (loading) {
    return (
      <div className="flex min-h-[100px] items-center justify-center bg-[#0a0a0a] p-4">
        <p className="text-sm text-[var(--dash-text-secondary)]">Loading…</p>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="flex min-h-[100px] items-center justify-center bg-[#0a0a0a] p-4">
        <p className="text-sm text-[var(--dash-text-secondary)]">Strategy not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100px] bg-[#0a0a0a] border border-[var(--dash-divider)] rounded-lg p-4">
      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{strategy.name}</p>
      <p className="text-xs text-[var(--dash-text-secondary)] mt-0.5">by {strategy.developerName}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-lg font-bold text-[#30d158]">
          ${(strategy.priceMonthlyCents / 100).toFixed(2)}/mo
        </span>
        {strategy.isActive ? (
          <a
            href={`${baseUrl}/trading/strategy/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg bg-[#30d158] px-4 py-2 text-sm font-semibold text-white hover:bg-[#30d158]/90 transition-colors"
          >
            Subscribe
          </a>
        ) : (
          <span className="text-xs text-[var(--dash-text-secondary)]">Unavailable</span>
        )}
      </div>
      <p className="mt-2 text-[10px] text-[var(--dash-text-secondary)]">
        Powered by <a href={baseUrl} target="_blank" rel="noopener noreferrer" className="text-[#30d158] hover:underline">Xpersona</a>
      </p>
    </div>
  );
}
