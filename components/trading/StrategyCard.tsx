import Link from "next/link";

interface StrategyCardProps {
  id: string;
  name: string;
  description?: string | null;
  priceMonthlyCents: number;
  developerName: string;
}

export function StrategyCard({ id, name, description, priceMonthlyCents, developerName }: StrategyCardProps) {
  const price = (priceMonthlyCents / 100).toFixed(2);

  return (
    <Link
      href={`/trading/strategy/${id}`}
      className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
    >
      <div className="agent-card p-5 transition-all duration-300 group-hover:scale-[1.02] border-[var(--dash-divider)] hover:border-[#30d158]/30 h-full flex flex-col">
        <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[#30d158] transition-colors">
          {name}
        </h3>
        <p className="text-xs text-[var(--dash-text-secondary)] mt-0.5">by {developerName}</p>
        {description && (
          <p className="mt-2 text-sm text-[var(--dash-text-secondary)] line-clamp-2 flex-1">
            {description}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-lg font-bold text-[#30d158]">${price}<span className="text-xs font-normal text-[var(--dash-text-secondary)]">/mo</span></span>
          <span className="text-xs text-[var(--dash-text-secondary)] group-hover:text-[#30d158] transition-colors">
            View →
          </span>
        </div>
      </div>
    </Link>
  );
}
