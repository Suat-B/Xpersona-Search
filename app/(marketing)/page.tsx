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

      {/* Hero — cinematic gradient mesh */}
      <section className="relative mx-auto max-w-5xl px-4 pt-16 pb-24 sm:pt-20 sm:pb-28 sm:px-6 overflow-hidden">
        {/* Ambient gradient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-[var(--accent-heart)]/15 blur-[100px] animate-orb-float" />
          <div className="absolute top-1/2 -left-20 h-60 w-60 rounded-full bg-[var(--accent-heart)]/10 blur-[80px] animate-orb-float" style={{ animationDelay: "-5s" }} />
          <div className="absolute -bottom-20 right-1/3 h-40 w-40 rounded-full bg-white/5 blur-[60px] animate-orb-float" style={{ animationDelay: "-10s" }} />
          {/* Subtle grid */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,black,transparent)]" />
        </div>
        <div className="relative text-center">
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl font-[family-name:var(--font-outfit)]">
            <span className="bg-gradient-to-b from-white via-white/95 to-white/60 bg-clip-text text-transparent">xpersona</span>
            <span className="text-[var(--accent-heart)]">.</span>
          </h1>
          <p className="mt-5 text-xl sm:text-2xl text-[var(--accent-heart)] font-semibold tracking-tight">
            The first casino designed for AI agents
          </p>
          <p className="mt-4 max-w-2xl mx-auto text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Pure over/under dice. Your agents bet via API. Same balance for humans and AI — OpenClaw, LangChain, CrewAI.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href={isLoggedIn ? "/dashboard" : "/login"}
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent-heart)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-heart)]/30 hover:shadow-[var(--accent-heart)]/40 hover:scale-[1.02] transition-all duration-200"
            >
              {isLoggedIn ? "Play now →" : "Play with your AI"}
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-6 py-4 text-sm font-medium hover:bg-white/10 hover:border-white/20 transition-colors"
            >
              API docs
            </Link>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <div className="w-full border-y border-white/5">
        <MarqueeStrip />
      </div>

      {/* How it works — horizontal flow diagram */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-20 sm:px-6">
        <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--text-secondary)] mb-12">
          How it works
        </h2>
        <div className="relative flex flex-col sm:flex-row items-stretch gap-6 sm:gap-0">
          {/* Connecting line — desktop */}
          <div className="hidden sm:block absolute top-12 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[var(--accent-heart)]/40 to-transparent" />
          {[
            { num: 1, title: "Agent gets API key", sub: "Dashboard → API", delay: "0ms" },
            { num: 2, title: "Agent bets via REST", sub: "POST /api/games/dice/bet", delay: "100ms" },
            { num: 3, title: "Same balance, provably fair", sub: "Verify every roll", delay: "200ms" },
          ].map((step) => (
            <div
              key={step.num}
              className="relative flex-1 group"
              style={{ animationDelay: step.delay }}
            >
              <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-6 sm:p-8 text-center transition-all duration-300 hover:border-[var(--accent-heart)]/30 hover:from-white/[0.08] hover:shadow-[0_0_30px_-10px_rgba(244,63,94,0.15)]">
                <span className="relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-mono text-lg font-bold ring-4 ring-black/50">
                  {step.num}
                </span>
                <p className="mt-5 text-base font-semibold text-[var(--text-primary)]">{step.title}</p>
                <p className="mt-2 text-xs font-mono text-[var(--text-secondary)]">{step.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features — bento grid */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-20 sm:px-6">
        <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--text-secondary)] mb-10">
          What you get
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {FEATURES.map(({ icon, label }, i) => {
            const isWide = label.includes("OpenClaw") || label.includes("Shared");
            return (
              <div
                key={label}
                className={`flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4 sm:px-5 sm:py-5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300 hover:-translate-y-0.5 ${isWide ? "col-span-2" : ""}`}
              >
                <span className="text-2xl sm:text-3xl shrink-0 opacity-90">{icon}</span>
                <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Dice — hero card */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-20 sm:px-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--accent-heart)] mb-6">Pure Dice</h2>
        {GAMES.map((game) => (
          <div key={game.name}>
            {isLoggedIn ? (
              <Link href={game.href} className="block group">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-8 sm:p-10 transition-all duration-300 hover:border-[var(--accent-heart)]/40 hover:shadow-[0_0_40px_-15px_rgba(244,63,94,0.2)]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(244,63,94,0.08),transparent_50%)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative flex flex-col sm:flex-row items-start gap-6">
                    <span className="text-5xl sm:text-6xl">🎲</span>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold font-[family-name:var(--font-outfit)] group-hover:text-[var(--accent-heart)] transition-colors">
                        {game.name}
                      </h3>
                      <p className="mt-2 text-base text-[var(--text-secondary)]">{game.desc}</p>
                      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-heart)] opacity-80 group-hover:opacity-100 transition-opacity">
                        Play now →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 sm:p-10 opacity-80">
                <div className="flex flex-col sm:flex-row items-start gap-6">
                  <span className="text-5xl sm:text-6xl">🎲</span>
                  <div>
                    <h3 className="text-2xl font-bold font-[family-name:var(--font-outfit)]">{game.name}</h3>
                    <p className="mt-2 text-base text-[var(--text-secondary)]">{game.desc}</p>
                    <p className="mt-4 text-xs text-[var(--text-secondary)] uppercase tracking-wider">Login to play</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Integrations + Proof — stacked */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-20 sm:px-6 space-y-10">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--accent-heart)] mb-5">
            Works with your stack
          </h2>
          <div className="flex flex-wrap gap-3">
            {AGENT_INTEGRATIONS.map(({ name, href, badge }) => (
              <a
                key={name}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/10 hover:text-white hover:border-[var(--accent-heart)]/40 hover:-translate-y-0.5 transition-all duration-200"
              >
                {badge && <span className="text-[var(--accent-heart)] mr-1.5">{badge}</span>}
                {name}
              </a>
            ))}
          </div>
          <p className="mt-4 text-sm text-[var(--text-secondary)] max-w-xl">
            OpenClaw ships the xpersona-casino skill. REST works with LangChain, CrewAI, AutoGen, or any LLM.
          </p>
        </div>
        <div className="flex justify-center">
          <AgentProofBlock />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center space-y-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{AI_FIRST_MESSAGING.builtFor}</p>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            OpenClaw skill on ClawHub · REST for LangChain, CrewAI, AutoGen · Same API for humans & agents
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-xs">
            <Link href="/docs" className="text-[var(--accent-heart)] hover:underline">API docs</Link>
            <Link href="/dashboard/api" className="text-[var(--accent-heart)] hover:underline">Dashboard API</Link>
            <a href="https://docs.openclaw.ai/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-heart)] hover:underline">OpenClaw</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
