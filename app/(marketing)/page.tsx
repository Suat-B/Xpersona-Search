import Link from "next/link";
import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { MarqueeStrip } from "@/components/ui/MarqueeStrip";
import { AgentProofBlock } from "@/components/ui/AgentProofBlock";
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
      <header className="sticky top-0 z-20 border-b border-white/5 bg-black/80 backdrop-blur-md">
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
                <Link
                  href="/login"
                  className="rounded-lg border border-[var(--accent-heart)]/50 bg-[var(--accent-heart)]/10 px-4 py-2 text-sm font-semibold text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-lg bg-[var(--accent-heart)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  Play
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
            <p className="font-medium">{authError === "guest_failed" ? "Guest access failed" : "Auth error"}</p>
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
        <p className="mt-3 max-w-xl mx-auto text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          Pure over/under dice. Your agents bet via API. Same balance for humans and AI — OpenClaw, LangChain, CrewAI.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-heart)]/25 hover:opacity-95 transition-opacity"
          >
            {isLoggedIn ? "Play now →" : "Play with your AI"}
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

      {/* How it works — premium pipeline */}
      <section className="relative mx-auto max-w-4xl px-4 py-14 sm:py-20 sm:px-6 overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_-20%,rgba(244,63,94,0.06),transparent_60%)]" aria-hidden="true" />
        <h2 className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent-heart)]/90 mb-14 sm:mb-16">
          How it works
        </h2>
        <div className="relative flex flex-col sm:flex-row items-stretch gap-6 sm:gap-0 sm:items-center">
          {/* Step 1 */}
          <div className="relative flex-1 group min-w-0">
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[var(--accent-heart)]/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-500" />
            <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-sm p-6 sm:p-8 text-center transition-all duration-300 group-hover:border-[var(--accent-heart)]/40 group-hover:shadow-[0_0_40px_-12px_rgba(244,63,94,0.25)] group-hover:-translate-y-1 group-hover:scale-[1.02]">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-heart)]/30 to-[var(--accent-heart)]/10 text-[var(--accent-heart)] font-bold text-lg shadow-inner ring-1 ring-white/5 mb-5">
                1
              </div>
              <p className="text-base sm:text-lg font-semibold text-white">Agent gets API key</p>
              <p className="mt-2 text-xs font-mono text-[var(--text-secondary)]">Dashboard → API</p>
            </div>
            {/* Connector — desktop */}
            <div className="hidden sm:flex absolute top-1/2 -right-3 w-6 h-6 items-center justify-center -translate-y-1/2 z-10">
              <svg className="w-4 h-4 text-[var(--accent-heart)]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>

          {/* Step 2 */}
          <div className="relative flex-1 group min-w-0">
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[var(--accent-heart)]/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-500" />
            <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-sm p-6 sm:p-8 text-center transition-all duration-300 group-hover:border-[var(--accent-heart)]/40 group-hover:shadow-[0_0_40px_-12px_rgba(244,63,94,0.25)] group-hover:-translate-y-1 group-hover:scale-[1.02] sm:mx-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-heart)]/30 to-[var(--accent-heart)]/10 text-[var(--accent-heart)] font-bold text-lg shadow-inner ring-1 ring-white/5 mb-5">
                2
              </div>
              <p className="text-base sm:text-lg font-semibold text-white">Agent bets via REST</p>
              <p className="mt-2 text-xs font-mono text-emerald-400/90 bg-emerald-500/10 rounded-lg px-2.5 py-1 inline-block border border-emerald-500/20">POST /api/games/dice/bet</p>
            </div>
            <div className="hidden sm:flex absolute top-1/2 -right-3 w-6 h-6 items-center justify-center -translate-y-1/2 z-10">
              <svg className="w-4 h-4 text-[var(--accent-heart)]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative flex-1 group min-w-0">
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[var(--accent-heart)]/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-500" />
            <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-sm p-6 sm:p-8 text-center transition-all duration-300 group-hover:border-[var(--accent-heart)]/40 group-hover:shadow-[0_0_40px_-12px_rgba(244,63,94,0.25)] group-hover:-translate-y-1 group-hover:scale-[1.02]">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-heart)]/30 to-[var(--accent-heart)]/10 text-[var(--accent-heart)] font-bold text-lg shadow-inner ring-1 ring-white/5 mb-5">
                3
              </div>
              <p className="text-base sm:text-lg font-semibold text-white">Same balance, provably fair</p>
              <p className="mt-2 text-xs font-mono text-[var(--text-secondary)]">Verify every roll</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features — polished bento grid */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:py-16 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {/* AI Agents Bet — hero card */}
          <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[var(--accent-heart)]/15 via-[var(--accent-heart)]/5 to-transparent backdrop-blur-sm p-5 sm:p-6 flex items-center gap-4 hover:border-[var(--accent-heart)]/30 transition-all duration-300 group hover:shadow-[0_0_30px_-10px_rgba(244,63,94,0.2)]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-heart)]/20 ring-1 ring-[var(--accent-heart)]/20 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6 text-[var(--accent-heart)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[var(--text-primary)]">AI Agents Bet</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Your agents play — same API, same balance</p>
            </div>
          </div>
          {/* Provably Fair */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm p-4 flex flex-col justify-center hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all duration-300 group">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 mb-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <p className="font-medium text-[var(--text-primary)] text-sm">Provably Fair</p>
          </div>
          {/* Python Strategies */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm p-4 flex flex-col justify-center hover:border-amber-500/30 hover:bg-amber-500/5 transition-all duration-300 group">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 mb-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </div>
            <p className="font-medium text-[var(--text-primary)] text-sm">Python Strategies</p>
          </div>
          {/* OpenClaw + LangChain + CrewAI */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm p-4 flex flex-col justify-center hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all duration-300 group">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 mb-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <p className="font-medium text-[var(--text-primary)] text-sm">OpenClaw + LangChain + CrewAI</p>
          </div>
          {/* Shared Balance */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm p-4 flex flex-col justify-center hover:border-violet-500/30 hover:bg-violet-500/5 transition-all duration-300 group">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400 mb-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <p className="font-medium text-[var(--text-primary)] text-sm">Shared Balance</p>
          </div>
          {/* Watch & Play */}
          <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-gradient-to-bl from-white/[0.05] to-transparent backdrop-blur-sm p-4 sm:p-5 flex items-center gap-4 hover:border-white/20 transition-all duration-300 group hover:shadow-[0_0_20px_-8px_rgba(255,255,255,0.08)]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/90 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[var(--text-primary)]">Watch & Play</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Humans and agents — one balance, one experience</p>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations — constellation showcase */}
      <section className="mx-auto max-w-4xl px-4 py-14 sm:py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.02] to-black/50 p-8 sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(244,63,94,0.08),transparent_70%)]" />
          <div className="relative">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent-heart)] mb-6">
              Works with your stack
            </h2>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {AGENT_INTEGRATIONS.map(({ name, href, badge }) => (
                <a
                  key={name}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="group/integration rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/10 hover:text-white hover:border-[var(--accent-heart)]/40 transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_20px_-5px_rgba(244,63,94,0.2)]"
                >
                  {badge && <span className="text-[var(--accent-heart)] mr-1.5">{badge}</span>}
                  {name}
                </a>
              ))}
            </div>
            <p className="mt-4 text-sm text-[var(--text-secondary)]/90 max-w-xl">
              OpenClaw ships the xpersona-casino skill. REST works with LangChain, CrewAI, AutoGen, or any LLM.
            </p>
            <div className="mt-8 flex flex-wrap justify-center sm:justify-start">
              <AgentProofBlock />
            </div>
          </div>
        </div>
      </section>

      {/* Dice card */}
      <section className="mx-auto max-w-4xl px-4 py-14 sm:py-20 sm:px-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--text-secondary)] mb-6">Pure Dice</h2>
        {GAMES.map((game) => (
          <div key={game.name}>
            {isLoggedIn ? (
              <Link href={game.href} className="block group">
                <GlassCard glow className="p-6 hover:border-[var(--accent-heart)]/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <span className="text-3xl">🎲</span>
                    <div>
                      <h3 className="text-lg font-bold font-[family-name:var(--font-outfit)] group-hover:text-[var(--accent-heart)] transition-colors">
                        {game.name}
                      </h3>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{game.desc}</p>
                      <span className="mt-2 inline-block text-xs font-semibold text-[var(--accent-heart)] opacity-0 group-hover:opacity-100 transition-opacity">
                        Play →
                      </span>
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ) : (
              <GlassCard className="p-6 opacity-70">
                <div className="flex items-start gap-4">
                  <span className="text-3xl">🎲</span>
                  <div>
                    <h3 className="text-lg font-bold font-[family-name:var(--font-outfit)]">{game.name}</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{game.desc}</p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)] uppercase">Login to play</p>
                  </div>
                </div>
              </GlassCard>
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
