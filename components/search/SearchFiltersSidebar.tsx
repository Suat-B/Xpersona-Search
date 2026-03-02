"use client";

import { useState } from "react";

type Facets = {
  protocols?: Array<{ protocol: string[]; count: number }>;
};

interface ProtocolOption {
  id: string;
  label: string;
}

interface SearchFiltersSidebarProps {
  facets?: Facets;
  protocolOptions: readonly ProtocolOption[];
  selectedProtocols: string[];
  onProtocolChange: (p: string[]) => void;
  minSafety: number;
  onSafetyChange: (n: number) => void;
  intent: "discover" | "execute";
  onIntentChange: (v: "discover" | "execute") => void;
  taskType: string;
  onTaskTypeChange: (v: string) => void;
  maxLatencyMs: string;
  onMaxLatencyMsChange: (v: string) => void;
  maxCostUsd: string;
  onMaxCostUsdChange: (v: string) => void;
  dataRegion: string;
  onDataRegionChange: (v: string) => void;
  requires: string;
  onRequiresChange: (v: string) => void;
  forbidden: string;
  onForbiddenChange: (v: string) => void;
  bundle: boolean;
  onBundleChange: (v: boolean) => void;
  explain: boolean;
  onExplainChange: (v: boolean) => void;
}

function buildProtocolCounts(facets?: Facets) {
  const counts = new Map<string, number>();
  facets?.protocols?.forEach(({ protocol, count }) => {
    protocol
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean)
      .forEach((p) => {
        counts.set(p, (counts.get(p) ?? 0) + count);
      });
  });
  return counts;
}

export function SearchFiltersSidebar({
  facets,
  protocolOptions,
  selectedProtocols,
  onProtocolChange,
  minSafety,
  onSafetyChange,
  intent,
  onIntentChange,
  taskType,
  onTaskTypeChange,
  maxLatencyMs,
  onMaxLatencyMsChange,
  maxCostUsd,
  onMaxCostUsdChange,
  dataRegion,
  onDataRegionChange,
  requires,
  onRequiresChange,
  forbidden,
  onForbiddenChange,
  bundle,
  onBundleChange,
  explain,
  onExplainChange,
}: SearchFiltersSidebarProps) {
  const [openSections, setOpenSections] = useState({
    protocols: true,
    trust: true,
    execution: true,
    compliance: true,
    advanced: true,
  });
  const protocolCounts = buildProtocolCounts(facets);
  const protocolLookup = new Map(protocolOptions.map((p) => [p.id.toUpperCase(), p.label]));
  const availableProtocols = Array.from(protocolCounts.keys());
  const unknownProtocols = availableProtocols.filter((p) => !protocolLookup.has(p));
  const orderedProtocols = [
    ...new Set([
      ...protocolOptions.map((p) => p.id.toUpperCase()),
      ...unknownProtocols.sort(),
    ]),
  ];

  const toggleProtocol = (protocolId: string) => {
    const upper = protocolId.toUpperCase();
    if (selectedProtocols.includes(upper)) {
      onProtocolChange(selectedProtocols.filter((p) => p !== upper));
    } else {
      onProtocolChange([...selectedProtocols, upper]);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/30 overflow-hidden">
      <section className="border-b border-[var(--border)]/70 last:border-b-0">
        <button
          type="button"
          onClick={() => setOpenSections((prev) => ({ ...prev, protocols: !prev.protocols }))}
          aria-expanded={openSections.protocols}
          aria-controls="filters-protocols"
          className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)] hover:bg-white/5 transition-colors"
        >
          Protocols
          <span className={`transition-transform ${openSections.protocols ? "rotate-180" : ""}`} aria-hidden>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {openSections.protocols && (
          <div id="filters-protocols" className="px-3 pb-3 space-y-2">
            {orderedProtocols.map((protocolId) => {
              const label = protocolLookup.get(protocolId) ?? protocolId;
              const count = protocolCounts.get(protocolId) ?? 0;
              if (!label) return null;
              return (
                <label key={protocolId} className="flex items-center justify-between gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedProtocols.includes(protocolId)}
                      onChange={() => toggleProtocol(protocolId)}
                      className="h-3.5 w-3.5 rounded border-white/20 bg-transparent text-[var(--accent-heart)] focus:ring-[var(--accent-heart)]/40"
                    />
                    <span className="text-sm">{label}</span>
                  </span>
                  <span className="text-[10px] text-[var(--text-quaternary)] rounded-full border border-[var(--border)]/60 px-1.5 py-0.5">
                    {count || "—"}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      <section className="border-b border-[var(--border)]/70 last:border-b-0">
        <button
          type="button"
          onClick={() => setOpenSections((prev) => ({ ...prev, trust: !prev.trust }))}
          aria-expanded={openSections.trust}
          aria-controls="filters-trust"
          className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)] hover:bg-white/5 transition-colors"
        >
          Trust
          <span className={`transition-transform ${openSections.trust ? "rotate-180" : ""}`} aria-hidden>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {openSections.trust && (
          <div id="filters-trust" className="px-3 pb-3 space-y-2">
            <input
              type="range"
              min={0}
              max={100}
              value={minSafety}
              onChange={(e) => onSafetyChange(Number(e.target.value))}
              aria-label="Minimum safety score"
              className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[var(--bg-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent-heart)] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-[var(--accent-heart)]/30"
            />
            <div className="text-xs text-[var(--text-tertiary)]">{minSafety}</div>
          </div>
        )}
      </section>

      <section className="border-b border-[var(--border)]/70 last:border-b-0">
        <button
          type="button"
          onClick={() => setOpenSections((prev) => ({ ...prev, execution: !prev.execution }))}
          aria-expanded={openSections.execution}
          aria-controls="filters-execution"
          className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)] hover:bg-white/5 transition-colors"
        >
          Execution
          <span className={`transition-transform ${openSections.execution ? "rotate-180" : ""}`} aria-hidden>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {openSections.execution && (
          <div id="filters-execution" className="px-3 pb-3 space-y-3">
            <div>
              <div className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Intent</div>
              <select
                value={intent}
                onChange={(e) => onIntentChange(e.target.value === "execute" ? "execute" : "discover")}
                className="w-full px-3 py-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30"
              >
                <option value="discover">Discover</option>
                <option value="execute">Execute</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Task type</div>
              <input
                value={taskType}
                onChange={(e) => onTaskTypeChange(e.target.value)}
                placeholder="retrieval, automation..."
                className="w-full px-3 py-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Max latency (ms)</div>
              <input
                value={maxLatencyMs}
                onChange={(e) => onMaxLatencyMsChange(e.target.value)}
                inputMode="numeric"
                placeholder="2000"
                className="w-full px-3 py-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Max cost (USD)</div>
              <input
                value={maxCostUsd}
                onChange={(e) => onMaxCostUsdChange(e.target.value)}
                inputMode="decimal"
                placeholder="0.05"
                className="w-full px-3 py-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
              />
            </div>
          </div>
        )}
      </section>

      <section className="border-b border-[var(--border)]/70 last:border-b-0">
        <button
          type="button"
          onClick={() => setOpenSections((prev) => ({ ...prev, compliance: !prev.compliance }))}
          aria-expanded={openSections.compliance}
          aria-controls="filters-compliance"
          className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)] hover:bg-white/5 transition-colors"
        >
          Compliance
          <span className={`transition-transform ${openSections.compliance ? "rotate-180" : ""}`} aria-hidden>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {openSections.compliance && (
          <div id="filters-compliance" className="px-3 pb-3 space-y-3">
            <div>
              <div className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Region</div>
              <select
                value={dataRegion}
                onChange={(e) => onDataRegionChange(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
              >
                <option value="global">Global</option>
                <option value="us">US</option>
                <option value="eu">EU</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Requires</div>
              <input
                value={requires}
                onChange={(e) => onRequiresChange(e.target.value)}
                placeholder="mcp, apiKey, streaming"
                className="w-full px-3 py-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Forbidden</div>
              <input
                value={forbidden}
                onChange={(e) => onForbiddenChange(e.target.value)}
                placeholder="paid-api, external-network"
                className="w-full px-3 py-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
              />
            </div>
          </div>
        )}
      </section>

      <section className="border-b border-[var(--border)]/70 last:border-b-0">
        <button
          type="button"
          onClick={() => setOpenSections((prev) => ({ ...prev, advanced: !prev.advanced }))}
          aria-expanded={openSections.advanced}
          aria-controls="filters-advanced"
          className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)] hover:bg-white/5 transition-colors"
        >
          Advanced
          <span className={`transition-transform ${openSections.advanced ? "rotate-180" : ""}`} aria-hidden>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {openSections.advanced && (
          <div id="filters-advanced" className="px-3 pb-3 space-y-3">
            <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
              Include fallbacks
              <input type="checkbox" checked={bundle} onChange={(e) => onBundleChange(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
              Explain ranking
              <input type="checkbox" checked={explain} onChange={(e) => onExplainChange(e.target.checked)} />
            </label>
          </div>
        )}
      </section>
    </div>
  );
}
