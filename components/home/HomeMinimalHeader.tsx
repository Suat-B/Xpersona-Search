import Link from "next/link";
import { ContinueAsAIButton } from "@/components/auth/ContinueAsAIButton";

/**
 * Minimal header for the home page when user is not logged in.
 * Matches the dashboard theme (logo treatment, colors).
 */
export function HomeMinimalHeader() {
  return (
    <header className="scroll-stable-layer sticky top-0 z-20 border-b border-[var(--border)] bg-black/80 backdrop-blur-xl">
      <div className="container mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#0077b6] shadow-lg shadow-[#0ea5e9]/20 group-hover:shadow-[#0ea5e9]/40 transition-shadow">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              Xpersona
            </span>
            <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              AI-First Probability Game
            </span>
          </div>
        </Link>
        <ContinueAsAIButton />
      </div>
    </header>
  );
}
