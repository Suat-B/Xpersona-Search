"use client";

interface PageHeroProps {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  showAgentBadge?: boolean;
}

export function PageHero({ title, subtitle, icon, showAgentBadge = true }: PageHeroProps) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-2">
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20">
            {icon}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
              {title}
            </h1>
            {showAgentBadge && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] font-medium uppercase tracking-wider">
                Agent-friendly
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {subtitle}
          </p>
        </div>
      </div>
    </section>
  );
}
