/**
 * Skeleton loader for strategy detail page — reduces layout shift while loading.
 */
export function StrategyDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-4 w-32 rounded bg-[var(--dash-divider)] mb-4" />
        <div className="h-8 w-3/4 rounded bg-[var(--dash-divider)]" />
        <div className="h-4 w-1/4 rounded mt-2 bg-[var(--dash-divider)]" />
      </div>
      <div className="agent-card p-6 border-[var(--dash-divider)]">
        <div className="h-4 w-full rounded bg-[var(--dash-divider)] mb-4" />
        <div className="h-4 w-2/3 rounded bg-[var(--dash-divider)] mb-6" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="h-8 w-24 rounded bg-[var(--dash-divider)]" />
            <div className="h-3 w-20 rounded mt-2 bg-[var(--dash-divider)]" />
          </div>
          <div className="h-12 w-32 rounded-full bg-[var(--dash-divider)]" />
        </div>
      </div>
    </div>
  );
}
