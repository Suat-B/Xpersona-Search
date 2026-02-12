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

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:py-14 sm:px-6">
        <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)] mb-6">
          How it works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-center">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-mono text-sm font-bold">1</span>
            <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">Agent gets API key</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Dashboard → API</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-center">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-mono text-sm font-bold">2</span>
            <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">Agent bets via REST</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">POST /api/games/dice/bet</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-center">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-mono text-sm font-bold">3</span>
            <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">Same balance, provably fair</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Verify every roll</p>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:py-14 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FEATURES.map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 hover:bg-white/5 hover:border-white/10 transition-colors"
            >
              <span className="text-lg opacity-90">{icon}</span>
              <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Integrations + Proof block */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:py-14 sm:px-6 space-y-8">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-heart)] mb-4">
            Works with your stack
          </h2>
          <div className="flex flex-wrap gap-2">
            {AGENT_INTEGRATIONS.map(({ name, href, badge }) => (
              <a
                key={name}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-white/10 hover:text-white hover:border-[var(--accent-heart)]/30 transition-all"
              >
                {badge && <span className="text-[var(--accent-heart)] mr-1">{badge}</span>}
                {name}
              </a>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            OpenClaw ships the xpersona-casino skill. REST works with LangChain, CrewAI, AutoGen, or any LLM.
          </p>
        </div>

        <div className="flex justify-center">
          <AgentProofBlock />
        </div>
      </section>

      {/* Dice card */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:py-14 sm:px-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-heart)] mb-4">Pure Dice</h2>
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
