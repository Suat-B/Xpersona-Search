import Link from "next/link";
import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { MarqueeStrip } from "@/components/ui/MarqueeStrip";
import { AgentProofBlock } from "@/components/ui/AgentProofBlock";
import { HomeApiKeySection } from "@/components/home/HomeApiKeySection";
import { ContinueAsAIButton } from "@/components/auth/ContinueAsAIButton";
import { ClaimFreeCreditsButton } from "@/components/auth/ClaimFreeCreditsButton";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";
import { DataIntelligenceBadge } from "@/components/ui/DataIntelligenceBadge";

const GAMES = [
  {
    name: "Dice",
    href: "/games/dice",
    desc: "Provably fair over/under. OpenClaw + REST API. Python strategies or play — same balance.",
  },
] as const;

const AGENT_INTEGRATIONS = [
  { name: "OpenClaw", href: "https://docs.openclaw.ai/", badge: "★" },
  { name: "LangChain", href: "https://www.langchain.com/", badge: null },
  { name: "CrewAI", href: "https://www.crewai.com/", badge: null },
  { name: "AutoGen", href: "https://microsoft.github.io/autogen/", badge: null },
  { name: "LangGraph", href: "https://langchain-ai.github.io/langgraph/", badge: null },
  { name: "Claude / GPT", href: "/dashboard/api", badge: null },
] as const;

type HomePageProps = { searchParams: Promise<{ error?: string; message?: string }> };

export default async function HomePage({ searchParams }: HomePageProps) {
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    // e.g. DB/adapter error
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isLoggedIn = !!(session?.user || userIdFromCookie);

  const params = await searchParams;
  const authError = params?.error;
  const authMessage = params?.message;

  return (
    <div className="space-y-8 animate-fade-in-up">
      {authError && (
        <AuthErrorBanner error={authError} message={authMessage ?? undefined} />
      )}

      {/* Hero — matches dashboard theme */}
      <header className="relative">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#30d158] shadow-[0_0_10px_#30d158] animate-pulse shrink-0" />
              <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                AI-FIRST PROBABILITY GAME
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-gradient-primary">
              Xpersona<span className="text-[var(--accent-heart)]">.</span>
            </h1>
            <p className="mt-2 text-[var(--accent-heart)] font-semibold">
              The first probability game platform designed for AI
            </p>
            <p className="mt-1 text-[var(--text-secondary)] text-sm">
              AI plays here.
            </p>
            <p className="mt-3 text-[var(--text-secondary)] max-w-lg leading-relaxed">
              Pure over/under dice. Your AI plays via API. Same balance for humans and AI — OpenClaw, LangChain, CrewAI.
            </p>
            <p className="mt-2 text-amber-400/90 text-sm leading-relaxed">
              <strong className="text-amber-300">Advanced Strategy Builder:</strong> 35 triggers, 31 actions — rule-based customization no other platform offers.
            </p>
            <p className="mt-2 text-emerald-400/90 text-sm leading-relaxed">
              <strong className="text-emerald-300">Data-Driven Intelligence:</strong> {AI_FIRST_MESSAGING.dataIntelligence.callout}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
            {!isLoggedIn && (
              <>
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/[0.03] px-5 py-3 text-sm font-medium hover:bg-white/[0.06] transition-all"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/[0.03] px-5 py-3 text-sm font-medium hover:bg-white/[0.06] transition-all"
                >
                  Sign up
                </Link>
              </>
            )}
            {!isLoggedIn && <ClaimFreeCreditsButton />}
            {isLoggedIn && (
              <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/[0.03] p-1 backdrop-blur-sm">
                <Link href="/dashboard/connect-ai" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.06] transition-all">
                  <svg className="w-4 h-4 text-[#0ea5e9]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Connect AI
                </Link>
                <div className="w-px h-4 bg-[var(--border)]" />
                <Link href="/dashboard/deposit" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.06] transition-all">
                  <svg className="w-4 h-4 text-[#30d158]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  Deposit
                </Link>
                <div className="w-px h-4 bg-[var(--border)]" />
                <Link href="/dashboard/withdraw" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.06] transition-all">
                  <svg className="w-4 h-4 text-[#0ea5e9]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  Withdraw
                </Link>
              </div>
            )}
            <Link
              href={isLoggedIn ? "/dashboard" : "/api/auth/play"}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-heart)]/25 hover:opacity-95 transition-opacity"
            >
              {isLoggedIn ? "Play now →" : AI_FIRST_MESSAGING.cta.both}
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/[0.03] px-5 py-3 text-sm font-medium hover:bg-white/[0.06] transition-all"
            >
              API docs
            </Link>
          </div>
        </div>
      </header>

      {/* Marquee — full width */}
      <div className="w-full border-y border-[var(--border)] -mx-6 md:-mx-8">
        <MarqueeStrip />
      </div>

      {/* API Key Management */}
      <HomeApiKeySection />

      {/* How it works — agent-card style */}
      <section className="relative">
        <div className="absolute -inset-8 bg-gradient-to-r from-[#0ea5e9]/5 via-[#0ea5e9]/3 to-transparent rounded-[40px] blur-3xl opacity-60 pointer-events-none" aria-hidden />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
            <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">AI flow</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Three steps to AI-powered dice
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-lg">
            From dashboard to verified roll — your AI plays in under a minute.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Step 1 — Setup */}
          <div className="agent-card p-5 sm:p-6 hover:border-[var(--accent-heart)]/25 transition-all duration-300 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/30 border-2 border-rose-500 text-rose-300 font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
              1
            </div>
            <h3 className="font-semibold text-white">Generate your AI key</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              One-click in Dashboard → API. Copy the bearer token — no OAuth, no sessions.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-[var(--text-secondary)]">Bearer</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-[var(--text-secondary)]">xp_••••••</span>
            </div>
          </div>

          {/* Step 2 — Core */}
          <div className="agent-card p-5 sm:p-6 hover:border-[#30d158]/30 transition-all duration-300 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
              2
            </div>
            <h3 className="font-semibold text-white">Play rounds via REST</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              POST to the dice endpoint with amount, target, and condition. Same API for OpenClaw and raw HTTP.
            </p>
            <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-2 font-mono text-[10px]">
              <span className="text-emerald-400/90">POST</span>
              <span className="text-white/90"> /api/games/dice/round</span>
            </div>
          </div>

          {/* Step 3 — Trust */}
          <div className="agent-card p-5 sm:p-6 hover:border-[#0ea5e9]/30 transition-all duration-300 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
              3
            </div>
            <h3 className="font-semibold text-white">Verify & share balance</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              Every roll is verifiable. One balance for humans and AI — watch your AI play live.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <svg className="w-4 h-4 text-cyan-400/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
              <span>Provably fair · Shared balance</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features — agent-card style */}
      <section className="relative">
        <div className="absolute -inset-8 bg-gradient-to-r from-[#0ea5e9]/5 via-transparent to-amber-500/5 rounded-[40px] blur-3xl opacity-50 pointer-events-none" aria-hidden />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
            <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Capabilities</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Built for AI and players
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-lg">
            Same API, same balance. Deploy Python strategies, OpenClaw skills, or watch your LLM play.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
          {/* Advanced Strategy Builder — differentiated */}
          <div className="sm:col-span-12 agent-card p-6 sm:p-8 border-amber-500/30 hover:border-amber-500/50 transition-all duration-300 group">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-500/25 ring-2 ring-amber-500/30 group-hover:scale-105 transition-transform">
                <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75c.621 0 1.125.504 1.125 1.125v18.75c0 .621-.504 1.125-1.125 1.125h-9.75c-.621 0-1.125-.504-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-amber-400/90 bg-amber-500/20 border border-amber-500/30 mb-2">
                  Unique to Xpersona
                </span>
                <h3 className="text-lg font-semibold text-white">Advanced Strategy Builder</h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  38+ trigger types (win, loss, streak, balance, profit, patterns) × 25+ actions (double, switch over/under, pause, stop). Rule-based strategies — no code, drag-and-drop, JSON-editable. AI agents can create and run strategies via API. No other platform offers this level of customization.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400/90 border border-amber-500/20">35 triggers</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400/90 border border-amber-500/20">31 actions</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400/90 border border-amber-500/20">REST + OpenClaw</span>
                </div>
                {isLoggedIn && (
                  <Link
                    href="/games/dice"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Build strategy
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Data Intelligence — differentiated */}
          <div className="sm:col-span-12 agent-card p-6 sm:p-8 border-emerald-500/30 hover:border-emerald-500/50 transition-all duration-300 group">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/25 ring-2 ring-emerald-500/30 group-hover:scale-105 transition-transform">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
                <svg className="absolute w-5 h-5 text-cyan-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-emerald-400/90 bg-emerald-500/20 border border-emerald-500/30 mb-2">
                  {AI_FIRST_MESSAGING.dataIntelligence.badge}
                </span>
                <h3 className="text-lg font-semibold text-white">Every AI Strategy is Pure Data</h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  {AI_FIRST_MESSAGING.dataIntelligence.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/20">Strategy Harvest</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/20">Execution Outcomes</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/20">P&L Tracking</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/20">Win Rate Analysis</span>
                </div>
                <div className="mt-4">
                  <DataIntelligenceBadge variant="full" showCount={true} />
                </div>
              </div>
            </div>
          </div>

          {/* AI — hero card, full width */}
          <div className="sm:col-span-12 agent-card p-6 sm:p-8 border-[var(--accent-heart)]/20 hover:border-[var(--accent-heart)]/30 transition-all duration-300 group">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-heart)]/20 ring-2 ring-[var(--accent-heart)]/25 group-hover:scale-105 transition-transform">
                <svg className="w-8 h-8 text-[var(--accent-heart)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white">AI Plays</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                  Your AI plays dice via REST — same API as humans. OpenClaw skill, LangChain tool, raw HTTP. One balance, one game.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-[var(--text-secondary)]">REST</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-[var(--text-secondary)]">Bearer</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-[var(--text-secondary)]">OpenClaw</span>
                </div>
              </div>
            </div>
          </div>

          {/* Provably Fair — detailed */}
          <div className="sm:col-span-4 agent-card p-5 sm:p-6 hover:border-[#30d158]/30 transition-all duration-300 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 mb-4 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h3 className="font-semibold text-white">Provably Fair</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              Every roll verifiable. Server seed, client seed, nonce — audit trail for AI and humans.
            </p>
          </div>

          {/* Python Strategies — detailed */}
          <div className="sm:col-span-4 agent-card p-5 sm:p-6 hover:border-amber-500/30 transition-all duration-300 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 mb-4 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </div>
            <h3 className="font-semibold text-white">Python Strategies</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              Code your edge. Martingale, D'Alembert, custom logic — run in-browser or via API.
            </p>
          </div>

          {/* OpenClaw + integrations — detailed */}
          <div className="sm:col-span-4 agent-card p-5 sm:p-6 hover:border-[#0ea5e9]/30 transition-all duration-300 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 mb-4 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <h3 className="font-semibold text-white">OpenClaw + LangChain + CrewAI</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              Native skill on ClawHub. REST works with any AI framework — AutoGen, LangGraph, Claude.
            </p>
          </div>

          {/* Shared Balance — wide card */}
          <div className="sm:col-span-6 agent-card p-5 sm:p-6 hover:border-violet-500/30 transition-all duration-300 group">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-400 group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-white">Shared Balance</h3>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                  One account, one balance. Humans and AI play from the same pool — no separate wallets.
                </p>
              </div>
            </div>
          </div>

          {/* Watch & Play — wide card */}
          <div className="sm:col-span-6 agent-card p-5 sm:p-6 hover:border-[var(--border-strong)] transition-all duration-300 group">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/90 group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-white">Watch & Play</h3>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                  View rolls in real time. Run a strategy while you watch — same dashboard, same session.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="relative">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
            <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Integrations</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Works with your stack
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-lg">
            OpenClaw ships the xpersona skill. REST works with LangChain, CrewAI, AutoGen, or any LLM.
          </p>
        </div>

        <div className="agent-card p-6 sm:p-8 hover:border-[var(--accent-heart)]/25 transition-all duration-300">
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {AGENT_INTEGRATIONS.map(({ name, href, badge }) => (
              <a
                key={name}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/[0.08] hover:text-white hover:border-[var(--accent-heart)]/30 transition-all duration-300"
              >
                {badge && <span className="text-[var(--accent-heart)] mr-1.5">{badge}</span>}
                {name}
              </a>
            ))}
          </div>
          <div className="mt-6">
            <AgentProofBlock />
          </div>
        </div>
      </section>

      {/* Pure Dice */}
      <section className="relative">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
            <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Games</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Pure Dice
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-lg">
            Provably fair over/under. Python strategies or play — same balance.
          </p>
        </div>

        {GAMES.map((game) => (
          <div key={game.name}>
            {isLoggedIn ? (
              <Link href={game.href} className="block group">
                <div className="agent-card p-5 sm:p-6 hover:border-[var(--accent-heart)]/30 transition-all duration-300">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] group-hover:scale-105 transition-transform">
                      <span className="text-2xl">🎲</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white group-hover:text-[var(--accent-heart)] transition-colors">
                        {game.name}
                      </h3>
                      <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                        {game.desc}
                      </p>
                      <span className="mt-2 inline-block text-xs font-semibold text-[var(--accent-heart)] opacity-0 group-hover:opacity-100 transition-opacity">
                        Play →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="agent-card p-5 sm:p-6 opacity-70">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/90">
                    <span className="text-2xl">🎲</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white">{game.name}</h3>
                    <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                      {game.desc}
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)] uppercase">Login to play</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Footer — matches dashboard theme */}
      <footer className="pt-12 border-t border-white/[0.06]">
        <div className="flex flex-col gap-6">
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/docs" className="text-[var(--text-secondary)] hover:text-[#0ea5e9] transition-colors">API docs</Link>
            <Link href="/dashboard/api" className="text-[var(--text-secondary)] hover:text-[#0ea5e9] transition-colors">Dashboard API</Link>
            <Link href="/games/dice" className="text-[var(--text-secondary)] hover:text-[#0ea5e9] transition-colors">Advanced Strategy Builder</Link>
            <a href="https://docs.openclaw.ai/" target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] hover:text-[#0ea5e9] transition-colors">OpenClaw</a>
          </nav>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-white/[0.04]">
            <p className="text-xs text-[var(--text-tertiary)]">
              Data-Driven · {AI_FIRST_MESSAGING.builtFor} · Provably Fair · OpenClaw skill on ClawHub · REST for LangChain, CrewAI, AutoGen
            </p>
            <span className="text-[11px] text-[var(--text-tertiary)]">Same API for humans & AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
