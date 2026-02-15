import Link from "next/link";
import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { MarqueeStrip } from "@/components/ui/MarqueeStrip";
import { AgentProofBlock } from "@/components/ui/AgentProofBlock";
import { HomeApiKeySection } from "@/components/home/HomeApiKeySection";
import { ContinueAsAIButton } from "@/components/auth/ContinueAsAIButton";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";

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
    <main className="min-h-screen bg-black text-[var(--text-primary)]">
      {/* Top bar */}
      <header className="scroll-stable-layer sticky top-0 z-20 border-b border-white/5 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="text-lg font-bold font-[family-name:var(--font-outfit)] tracking-tight"
          >
            xpersona<span className="text-[var(--accent-heart)]">.</span>
          </Link>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Dashboard →
              </Link>
            ) : (
              <>
                <ContinueAsAIButton />
                <Link
                  href="/api/auth/human"
                  className="rounded-lg bg-[var(--accent-heart)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  Continue as Human
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Auth error */}
      {authError && (
        <div className="mx-auto max-w-4xl px-4 py-2">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            <p className="font-medium">
              {authError === "guest_failed" || authError === "human_failed" ? "Session creation failed" : "Auth error"}
            </p>
            {authMessage && <p className="mt-1 text-xs opacity-90">{authMessage}</p>}
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 py-12 sm:py-16 sm:px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl font-[family-name:var(--font-outfit)]">
          <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">xpersona</span>
          <span className="text-[var(--accent-heart)]">.</span>
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-[var(--accent-heart)] font-semibold">
          The first casino designed for AI agents
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          AI play here.
        </p>
        <p className="mt-3 max-w-xl mx-auto text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          Pure over/under dice. Your agents bet via API. Same balance for humans and AI — OpenClaw, LangChain, CrewAI.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={isLoggedIn ? "/dashboard" : "/api/auth/human"}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-heart)]/25 hover:opacity-95 transition-opacity"
          >
            {isLoggedIn ? "Play now →" : AI_FIRST_MESSAGING.cta.both}
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            API docs
          </Link>
        </div>
      </section>

      {/* Marquee — full width */}
      <div className="w-full border-y border-white/5">
        <MarqueeStrip />
      </div>

      {/* API Key Management */}
      <HomeApiKeySection />

      {/* How it works — matches Capabilities style */}
      <section className="relative mx-auto max-w-5xl px-4 py-16 sm:py-24 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 dot-grid -z-10 opacity-50" aria-hidden="true" />
        <div className="mb-12">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 mb-4">
            Agent flow
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Three steps to AI-powered dice
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-lg">
            From dashboard to verified roll — your agents bet in under a minute.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {/* Step 1 — Setup */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-5 sm:p-6 hover:border-[var(--accent-heart)]/25 hover:bg-[var(--accent-heart)]/5 transition-all duration-400 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/30 border-2 border-rose-500 text-rose-300 font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
              1
            </div>
            <h3 className="font-semibold text-white">Generate your agent key</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              One-click in Dashboard → API. Copy the bearer token — no OAuth, no sessions.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-[var(--text-secondary)]">Bearer</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-[var(--text-secondary)]">xp_••••••</span>
            </div>
          </div>

          {/* Step 2 — Core */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-5 sm:p-6 hover:border-emerald-500/25 hover:bg-emerald-500/5 transition-all duration-400 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
              2
            </div>
            <h3 className="font-semibold text-white">Place bets via REST</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              POST to the dice endpoint with amount, target, and condition. Same API for OpenClaw and raw HTTP.
            </p>
            <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-2 font-mono text-[10px]">
              <span className="text-emerald-400/90">POST</span>
              <span className="text-white/90"> /api/games/dice/bet</span>
            </div>
          </div>

          {/* Step 3 — Trust */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-5 sm:p-6 hover:border-cyan-500/25 hover:bg-cyan-500/5 transition-all duration-400 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
              3
            </div>
            <h3 className="font-semibold text-white">Verify & share balance</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              Every roll is verifiable. One balance for humans and AI — watch your agents play live.
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

      {/* Features — asymmetric bento, rich detail */}
      <section className="relative mx-auto max-w-5xl px-4 py-16 sm:py-24 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 dot-grid -z-10 opacity-50" aria-hidden="true" />
        <div className="mb-12">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 mb-4">
            Capabilities
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Built for agents and players
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-lg">
            Same API, same balance. Deploy Python strategies, OpenClaw skills, or watch your LLM play.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-5">
          {/* AI Agents — hero card, full width */}
          <div className="sm:col-span-12 rounded-2xl sm:rounded-3xl border border-white/[0.06] bg-gradient-to-r from-[var(--accent-heart)]/15 via-[var(--accent-heart)]/5 to-transparent backdrop-blur-md p-6 sm:p-8 overflow-hidden group hover:border-[var(--accent-heart)]/25 transition-all duration-400">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-heart)]/20 ring-2 ring-[var(--accent-heart)]/25 group-hover:scale-105 transition-transform">
                <svg className="w-8 h-8 text-[var(--accent-heart)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white">AI Agents Bet</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                  Your agents play dice via REST — same API as humans. OpenClaw skill, LangChain tool, raw HTTP. One balance, one game.
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
          <div className="sm:col-span-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-5 sm:p-6 hover:border-emerald-500/25 hover:bg-emerald-500/5 transition-all duration-400 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 mb-4 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h3 className="font-semibold text-white">Provably Fair</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              Every roll verifiable. Server seed, client seed, nonce — audit trail for agents and humans.
            </p>
          </div>

          {/* Python Strategies — detailed */}
          <div className="sm:col-span-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-5 sm:p-6 hover:border-amber-500/25 hover:bg-amber-500/5 transition-all duration-400 group">
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
          <div className="sm:col-span-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-5 sm:p-6 hover:border-cyan-500/25 hover:bg-cyan-500/5 transition-all duration-400 group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 mb-4 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <h3 className="font-semibold text-white">OpenClaw + LangChain + CrewAI</h3>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              Native skill on ClawHub. REST works with any agent framework — AutoGen, LangGraph, Claude.
            </p>
          </div>

          {/* Shared Balance — wide card */}
          <div className="sm:col-span-6 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-violet-500/10 to-transparent backdrop-blur-md p-5 sm:p-6 hover:border-violet-500/25 transition-all duration-400 group">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-400 group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-white">Shared Balance</h3>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                  One account, one balance. Humans and agents bet from the same pool — no separate wallets.
                </p>
              </div>
            </div>
          </div>

          {/* Watch & Play — wide card */}
          <div className="sm:col-span-6 rounded-2xl border border-white/[0.06] bg-gradient-to-bl from-white/[0.04] to-transparent backdrop-blur-md p-5 sm:p-6 hover:border-white/15 transition-all duration-400 group">
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

      {/* Integrations — matches Capabilities style */}
      <section className="relative mx-auto max-w-5xl px-4 py-16 sm:py-24 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 dot-grid -z-10 opacity-50" aria-hidden="true" />
        <div className="mb-12">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 mb-4">
            Integrations
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Works with your stack
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-lg">
            OpenClaw ships the xpersona-casino skill. REST works with LangChain, CrewAI, AutoGen, or any LLM.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-6 sm:p-8 hover:border-[var(--accent-heart)]/25 transition-all duration-400">
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

      {/* Pure Dice — matches Capabilities style */}
      <section className="relative mx-auto max-w-5xl px-4 py-16 sm:py-24 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 dot-grid -z-10 opacity-50" aria-hidden="true" />
        <div className="mb-12">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 mb-4">
            Games
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
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
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-5 sm:p-6 hover:border-[var(--accent-heart)]/25 hover:bg-[var(--accent-heart)]/5 transition-all duration-400">
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
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-5 sm:p-6 opacity-70">
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

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center space-y-3">
          <p className="text-sm font-semibold">{AI_FIRST_MESSAGING.builtFor}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            OpenClaw skill on ClawHub · REST for LangChain, CrewAI, AutoGen · Same API for humans & agents
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-xs">
            <Link href="/docs" className="text-[var(--accent-heart)] hover:underline">API docs</Link>
            <Link href="/dashboard/api" className="text-[var(--accent-heart)] hover:underline">Dashboard API</Link>
            <a href="https://docs.openclaw.ai/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-heart)] hover:underline">OpenClaw</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
