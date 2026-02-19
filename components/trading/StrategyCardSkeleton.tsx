/**
 * Skeleton loader for StrategyCard — reduces layout shift while marketplace loads.
 */
export function StrategyCardSkeleton() {
  return (
    <div className="agent-card p-5 border-[var(--dash-divider)] h-full flex flex-col animate-pulse">
      <div className="h-5 w-3/4 rounded bg-[var(--dash-divider)]" />
      <div className="h-3 w-1/3 rounded mt-2 bg-[var(--dash-divider)]" />
      <div className="h-4 w-full rounded mt-3 bg-[var(--dash-divider)]" />
      <div className="h-4 w-2/3 rounded mt-2 bg-[var(--dash-divider)]" />
      <div className="mt-4 flex items-center justify-between">
        <div className="h-6 w-16 rounded bg-[var(--dash-divider)]" />
        <div className="h-3 w-12 rounded bg-[var(--dash-divider)]" />
      </div>
    </div>
  );
}
