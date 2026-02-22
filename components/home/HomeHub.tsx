import Link from "next/link";

/**
 * Hub for authenticated users — Game and Trading entry cards.
 */
export function HomeHub() {
  return (
    <section className="relative">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
          <span className="text-xs font-medium text-[var(--dash-text-secondary)] uppercase tracking-wider">
            WELCOME BACK
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-gradient-primary">
          Xpersona
        </h1>
        <p className="mt-2 text-sm text-[var(--dash-text-secondary)]">
          Choose your destination
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Game */}
        <Link
          href="/dashboard"
          className="group block"
        >
          <div className="agent-card h-full min-h-[200px] p-6 transition-all duration-500 group-hover:scale-[1.02] border-[var(--dash-divider)] hover:border-[#0ea5e9]/30">
            <div className="relative flex items-start gap-5">
              <div
                className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0ea5e9] to-[#0077b6] shadow-lg group-hover:shadow-xl group-hover:scale-110 transition-all duration-500"
              >
                <span className="text-3xl">🎲</span>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#30d158] rounded-full border-2 border-[#0a0a0a]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-[var(--text-primary)] text-xl group-hover:text-[#0ea5e9] transition-all">
                  Game
                </h2>
                <p className="mt-1.5 text-sm text-[var(--dash-text-secondary)]">
                  Play dice, manage credits, run strategies. Deposit, withdraw, connect AI.
                </p>
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[#0ea5e9] opacity-0 group-hover:opacity-100 transition-all duration-300">
                  Go to Dashboard
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </Link>

        {/* Trading */}
        <Link
          href="/trading"
          className="group block"
        >
          <div className="agent-card h-full min-h-[200px] p-6 transition-all duration-500 group-hover:scale-[1.02] border-[var(--dash-divider)] hover:border-[#30d158]/30">
            <div className="relative flex items-start gap-5">
              <div
                className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#30d158] to-[#248a3d] shadow-lg group-hover:shadow-xl group-hover:scale-110 transition-all duration-500"
              >
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#30d158] rounded-full border-2 border-[#0a0a0a]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-[var(--text-primary)] text-xl group-hover:text-[#30d158] transition-all">
                  Trading
                </h2>
                <p className="mt-1.5 text-sm text-[var(--dash-text-secondary)]">
                  Browse strategy marketplace. List your strategies. Set your price. We take 20%.
                </p>
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[#30d158] opacity-0 group-hover:opacity-100 transition-all duration-300">
                  Go to Marketplace
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Quick links */}
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/dashboard" className="text-[var(--dash-text-secondary)] hover:text-[#0ea5e9] transition-colors">
          Dashboard
        </Link>
        <Link href="/trading" className="text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors">
          Trading
        </Link>
        <Link href="/games/dice" className="text-[var(--dash-text-secondary)] hover:text-[#0ea5e9] transition-colors">
          Open Game
        </Link>
        <Link href="/dashboard/strategies" className="text-[var(--dash-text-secondary)] hover:text-[#0ea5e9] transition-colors">
          Strategies
        </Link>
      </div>
    </section>
  );
}
