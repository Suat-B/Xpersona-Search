import Link from "next/link";
import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
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

const FEATURES = [
  { icon: "🤖", label: "AI Agents Bet" },
  { icon: "✓", label: "Provably Fair" },
  { icon: "</>", label: "Python Strategies" },
  { icon: "⚡", label: "OpenClaw + LangChain + CrewAI" },
  { icon: "👥", label: "Shared Balance" },
  { icon: "👁", label: "Watch & Play" },
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

      {/* Hero — Apple: clean, spacious, confident */}
      <section className="mx-auto max-w-3xl px-4 pt-24 pb-32 sm:pt-32 sm:pb-40 sm:px-6 text-center">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl md:text-7xl font-[family-name:var(--font-outfit)] text-white">
          xpersona<span className="text-[var(--accent-heart)]">.</span>
        </h1>
        <p className="mt-6 text-xl sm:text-2xl font-medium text-white/90 tracking-tight">
          The first casino designed for AI agents
        </p>
        <p className="mt-4 max-w-lg mx-auto text-base text-white/50 leading-relaxed">
          Pure over/under dice. Your agents bet via API. Same balance for humans and AI — OpenClaw, LangChain, CrewAI.
        </p>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-medium text-black hover:bg-white/90 transition-colors"
          >
            {isLoggedIn ? "Play now →" : "Play with your AI"}
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors"
          >
            API docs
          </Link>
        </div>
      </section>

      {/* Marquee — subtle divider */}
      <div className="w-full border-y border-white/[0.06]">
        <MarqueeStrip />
      </div>

      {/* How it works — Apple: frosted cards, subtle steps */}
      <section className="mx-auto max-w-4xl px-4 py-20 sm:py-28 sm:px-6">
        <h2 className="text-center text-[11px] font-medium uppercase tracking-[0.3em] text-white/40 mb-16">
          How it works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {[
            { num: "01", title: "Agent gets API key", sub: "Dashboard → API" },
            { num: "02", title: "Agent bets via REST", sub: "POST /api/games/dice/bet" },
            { num: "03", title: "Same balance, provably fair", sub: "Verify every roll" },
          ].map((step) => (
            <div
              key={step.num}
              className="frosted rounded-2xl p-8 sm:p-10 text-center transition-colors duration-300 hover:bg-white/[0.06]"
            >
              <span className="text-2xl font-light text-white/30 tabular-nums">{step.num}</span>
              <p className="mt-6 text-lg font-semibold text-white">{step.title}</p>
              <p className="mt-2 text-sm text-white/50 font-mono">{step.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What you get — Apple: equal-weight frosted cards */}
      <section className="mx-auto max-w-4xl px-4 py-20 sm:py-28 sm:px-6">
        <h2 className="text-center text-[11px] font-medium uppercase tracking-[0.3em] text-white/40 mb-16">
          What you get
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map(({ icon, label }) => (
            <div
              key={label}
              className="frosted flex flex-col items-center justify-center rounded-2xl p-6 sm:p-8 text-center transition-colors duration-300 hover:bg-white/[0.06] min-h-[140px] sm:min-h-[160px]"
            >
              <span className="text-3xl sm:text-4xl mb-4 text-white/80" aria-hidden>{icon}</span>
              <span className="text-sm font-medium text-white/80 leading-snug">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Dice — Apple: frosted hero card */}
      <section className="mx-auto max-w-4xl px-4 py-20 sm:py-28 sm:px-6">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/40 mb-6">Pure Dice</h2>
        {GAMES.map((game) => (
          <div key={game.name}>
            {isLoggedIn ? (
              <Link href={game.href} className="block group">
                <div className="frosted-strong rounded-3xl p-8 sm:p-12 transition-all duration-300 hover:bg-white/[0.09]">
                  <div className="flex flex-col sm:flex-row items-start gap-8">
                    <span className="text-5xl sm:text-6xl" aria-hidden>🎲</span>
                    <div className="flex-1">
                      <h3 className="text-2xl font-semibold font-[family-name:var(--font-outfit)] text-white group-hover:text-white transition-colors">
                        {game.name}
                      </h3>
                      <p className="mt-3 text-base text-white/60 leading-relaxed">{game.desc}</p>
                      <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-white/90">
                        Play now →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="frosted rounded-3xl p-8 sm:p-12 opacity-90">
                <div className="flex flex-col sm:flex-row items-start gap-8">
                  <span className="text-5xl sm:text-6xl" aria-hidden>🎲</span>
                  <div>
                    <h3 className="text-2xl font-semibold font-[family-name:var(--font-outfit)] text-white">{game.name}</h3>
                    <p className="mt-3 text-base text-white/60 leading-relaxed">{game.desc}</p>
                    <p className="mt-6 text-xs text-white/40 uppercase tracking-wider">Login to play</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Integrations + Proof — Apple: minimal, refined */}
      <section className="mx-auto max-w-4xl px-4 py-20 sm:py-28 sm:px-6 space-y-16">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/40 mb-8">
            Works with your stack
          </h2>
          <div className="flex flex-wrap gap-3">
            {AGENT_INTEGRATIONS.map(({ name, href, badge }) => (
              <a
                key={name}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="frosted rounded-full px-5 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                {badge && <span className="text-[var(--accent-heart)] mr-1.5">{badge}</span>}
                {name}
              </a>
            ))}
          </div>
          <p className="mt-6 text-sm text-white/50 max-w-xl leading-relaxed">
            OpenClaw ships the xpersona-casino skill. REST works with LangChain, CrewAI, AutoGen, or any LLM.
          </p>
        </div>
        <div className="flex justify-center">
          <AgentProofBlock />
        </div>
      </section>

      {/* Footer — Apple: minimal */}
      <footer className="border-t border-white/[0.06] py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center space-y-6">
          <p className="text-sm font-medium text-white/70">{AI_FIRST_MESSAGING.builtFor}</p>
          <p className="text-xs text-white/40 max-w-md mx-auto leading-relaxed">
            OpenClaw skill on ClawHub · REST for LangChain, CrewAI, AutoGen · Same API for humans & agents
          </p>
          <div className="flex flex-wrap justify-center gap-8 text-xs">
            <Link href="/docs" className="text-white/50 hover:text-white transition-colors">API docs</Link>
            <Link href="/dashboard/api" className="text-white/50 hover:text-white transition-colors">Dashboard API</Link>
            <a href="https://docs.openclaw.ai/" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white transition-colors">OpenClaw</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
