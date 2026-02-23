"use client";

interface Props {
  minSafety: number;
  onSafetyChange: (n: number) => void;
  sort: string;
  onSortChange: (s: string) => void;
}

export function SearchFilters({
  minSafety,
  onSafetyChange,
  sort,
  onSortChange,
}: Props) {
  return (
    <div className="neural-glass neural-glass-hover p-4 rounded-xl border border-[var(--border)] space-y-6">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          Min Safety
        </h3>
        <input
          type="range"
          min={0}
          max={100}
          value={minSafety}
          onChange={(e) => onSafetyChange(Number(e.target.value))}
          aria-label="Minimum safety score"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={minSafety}
          className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[var(--bg-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent-heart)] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-[var(--accent-heart)]/30"
        />
        <p className="text-xs text-[var(--text-tertiary)] mt-1">{minSafety}</p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Sort</h3>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          aria-label="Sort results by"
          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] focus:border-[var(--accent-heart)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] transition-colors hover:border-[var(--border-strong)]"
        >
          <option value="rank">By Rank</option>
          <option value="safety">By Safety</option>
          <option value="popularity">By Popularity</option>
          <option value="freshness">By Freshness</option>
        </select>
      </div>
    </div>
  );
}
