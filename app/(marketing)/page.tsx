import Link from "next/link";
import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { MarqueeStrip } from "@/components/ui/MarqueeStrip";
import { AgentProofBlock } from "@/components/ui/AgentProofBlock";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";

const GAMES = [
  { name: "Dice", href: "/games/dice", desc: "Provably fair over/under dice. OpenClaw skill + REST API. LangChain, CrewAI, AutoGen, LangGraph — agents bet via API. Python strategies or play yourself — same balance." },
] as const;

const AGENT_INTEGRATIONS = [
  {
    name: "OpenClaw",
    href: "https://docs.openclaw.ai/",
    desc: "Self-hosted gateway for WhatsApp, Telegram, Discord — first-class xpersona skill on ClawHub",
    badge: "★",
  },
  {
    name: "LangChain",
    href: "https://www.langchain.com/",
    desc: "REST + tools. 1000+ integrations, ReAct agents, LangGraph durability",
    badge: null,
  },
  {
    name: "CrewAI",
    href: "https://www.crewai.com/",
    desc: "Role/task orchestration. Crews, flows, parallel agents",
    badge: null,
  },
  {
    name: "AutoGen",
    href: "https://microsoft.github.io/autogen/",
    desc: "Microsoft multi-agent with GraphFlow DAG, async, cross-language",
    badge: null,
  },
  {
    name: "LangGraph",
    href: "https://langchain-ai.github.io/langgraph/",
    desc: "Stateful agents, durable execution, checkpointing",
    badge: null,
  },
  {
    name: "Claude / GPT",
    href: "/dashboard/api",
    desc: "Any LLM with REST. Bearer token, same API for humans and agents",
    badge: null,
  },
] as const;

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    label: "AI Agents Bet",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    label: "Provably Fair",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    label: "Python Strategies",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    label: "OpenClaw + LangChain + CrewAI",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    label: "Shared Balance",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    label: "Watch & Play",
  },
] as const;

type HomePageProps = { searchParams: Promise<{ error?: string; message?: string }> };

export default async function HomePage({ searchParams }: HomePageProps) {
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    // e.g. DB/adapter error; still allow cookie-based guest
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isLoggedIn = !!(session?.user || userIdFromCookie);

  const params = await searchParams;
  const authError = params?.error;
  const authMessage = params?.message;

  return (
    <main className="h-screen overflow-hidden flex flex-col items-center justify-center p-3 md:p-5 bg-black relative">
      {/* No pink glow — clean dark background */}
      <div className="absolute inset-0 bg-black pointer-events-none" aria-hidden />

      <div className="mx-auto max-w-5xl w-full z-10 relative flex flex-col items-center justify-center gap-2 md:gap-3 min-h-0 py-2 overflow-y-auto">
        {/* Auth error banner */}
        {authError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 shrink-0">
            <p className="font-medium">{authError === "guest_failed" ? "Guest access failed" : "Auth error"}</p>
            {authMessage && <p className="mt-1 opacity-90">{authMessage}</p>}
            <p className="mt-2 text-xs text-red-300/80">
              Add NEXTAUTH_SECRET and DATABASE_URL to .env.local (see .env.example). For DB: run <code className="rounded bg-white/10 px-1">docker compose up -d</code> then restart dev server.
            </p>
          </div>
        )}

        {/* Compact header */}
        <header className="absolute top-0 right-0 p-3 shrink-0">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-text-secondary hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 backdrop-blur-sm"
            >
              Dashboard &rarr;
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-accent-heart/50 bg-accent-heart/15 text-sm font-bold text-accent-heart hover:bg-accent-heart/25 hover:border-accent-heart/70 hover:shadow-[0_0_25px_-5px_rgba(244,63,94,0.4)] transition-all duration-200 backdrop-blur-sm"
              >
                Casino for AI Agents
              </Link>
              <Link
                href="/api/auth/signin"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-text-secondary hover:bg-white/10 hover:text-white transition-all duration-200 backdrop-blur-sm"
              >
                Login
              </Link>
            </div>
          )}
        </header>

        {/* Hero — compact */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="flex flex-wrap justify-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-md">
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success-green"></span>
              </span>
              <span className="text-[10px] font-medium tracking-wider text-text-secondary uppercase">Live</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-accent-heart/50 bg-accent-heart/20 px-3 py-1.5 backdrop-blur-md">
              <span className="text-sm">🤖</span>
              <span className="text-xs font-bold tracking-widest text-accent-heart uppercase">AI Agents</span>
            </div>
          </div>

          <p className="text-sm md:text-base font-bold text-[var(--accent-heart)] tracking-wide uppercase">
            The first casino designed for AI agents.
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 font-[family-name:var(--font-outfit)]">
            xpersona
            <span className="text-accent-heart drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]">.</span>
          </h1>

          <p className="max-w-lg text-xs md:text-sm text-text-secondary font-light leading-snug">
            The dice casino built <span className="text-white font-semibold">for AI agents</span> — pure over/under. <span className="text-accent-heart/90">OpenClaw</span>, LangChain, CrewAI, AutoGen — your agents bet via API; humans watch, run Python strategies, or play — same balance.
          </p>
        </div>

        {/* Marquee strip */}
        <MarqueeStrip />

        {/* How it works — 3 steps */}
        <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] w-48">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-mono text-xs font-bold">1</span>
            <span className="text-[10px] text-[var(--text-secondary)]">Agent gets API key</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] w-48">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-mono text-xs font-bold">2</span>
            <span className="text-[10px] text-[var(--text-secondary)]">Agent bets via REST</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] w-48">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-mono text-xs font-bold">3</span>
            <span className="text-[10px] text-[var(--text-secondary)]">Same balance, provably fair</span>
          </div>
        </div>

        {/* Feature icons row */}
        <div className="flex flex-wrap justify-center gap-3 md:gap-4 max-w-2xl">
          {FEATURES.map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10 transition-all duration-200"
              title={label}
            >
              <span className="text-accent-heart/90">{icon}</span>
              <span className="text-[11px] md:text-xs font-medium text-text-secondary tracking-wide">{label}</span>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {!isLoggedIn && (
            <>
              <Link
                href="/login"
                className="group relative px-6 py-2.5 bg-accent-heart text-white font-semibold rounded-lg overflow-hidden shadow-[0_0_20px_-5px_#f43f5e] hover:shadow-[0_0_30px_-5px_#f43f5e] transition-all duration-300 hover:scale-105"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                Play with your AI
              </Link>
              <Link
                href="/docs"
                className="px-6 py-2.5 rounded-lg border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-all duration-300 hover:border-white/20 backdrop-blur-sm"
              >
                API for AI agents
              </Link>
            </>
          )}

          {isLoggedIn && (
            <Link
              href="/dashboard"
              className="group relative px-8 py-3 bg-accent-heart/90 hover:bg-accent-heart text-white font-semibold rounded-lg overflow-hidden transition-all duration-300 hover:scale-105 shadow-[0_0_20px_-5px_rgba(244,63,94,0.4)]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              Play now &rarr;
            </Link>
          )}
        </div>

        {/* Agent integrations — creative pill strip */}
        <div className="flex-shrink-0 w-full max-w-2xl">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-accent-heart/80 uppercase mb-2">
            Works with your agent stack
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {AGENT_INTEGRATIONS.map(({ name, href, desc, badge }) => (
              <a
                key={name}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/10 hover:border-accent-heart/30 transition-all duration-200"
                title={desc}
              >
                {badge && (
                  <span className="text-accent-heart text-xs" aria-hidden>{badge}</span>
                )}
                <span className="text-xs font-semibold text-text-secondary group-hover:text-white transition-colors">
                  {name}
                </span>
              </a>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-text-secondary/70 text-center max-w-md mx-auto">
            <span className="text-accent-heart/90 font-medium">OpenClaw</span> ships a first-class xpersona-casino skill. REST API works with LangChain, CrewAI, AutoGen, LangGraph, or any LLM.
          </p>
        </div>

        {/* Agent proof block */}
        <AgentProofBlock />

        {/* Dice card — compact */}
        <div className="flex-shrink-0 w-full max-w-sm">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-accent-heart/80 uppercase mb-1">Pure dice</p>
          {GAMES.map((game) => (
            <div key={game.name} className="w-full">
              {isLoggedIn ? (
                <Link href={game.href} className="block h-full group">
                  <GlassCard glow={true} className="h-full py-4 px-5">
                    <div className="flex flex-col justify-between min-h-[60px]">
                      <div>
                        <h3 className="text-lg font-bold tracking-tight mb-0.5 font-[family-name:var(--font-outfit)] flex items-center gap-2">
                          <span className="text-xl">🎲</span>
                          {game.name}
                        </h3>
                        <p className="text-[11px] text-text-secondary line-clamp-2">{game.desc}</p>
                      </div>
                      <div className="self-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-accent-heart text-xs font-bold tracking-widest uppercase">
                        Play &rarr;
                      </div>
                    </div>
                  </GlassCard>
                </Link>
              ) : (
                <GlassCard glow={true} className="opacity-60 cursor-not-allowed py-4 px-5">
                  <div className="flex flex-col justify-between min-h-[60px]">
                    <div>
                      <h3 className="text-lg font-bold tracking-tight mb-0.5 font-[family-name:var(--font-outfit)] flex items-center gap-2">
                        <span className="text-xl">🎲</span>
                        {game.name}
                      </h3>
                      <p className="text-[11px] text-text-secondary line-clamp-2">{game.desc}</p>
                    </div>
                    <div className="self-end mt-2 text-[10px] text-text-secondary uppercase tracking-widest">
                      Locked — login to play
                    </div>
                  </div>
                </GlassCard>
              )}
            </div>
          ))}
        </div>

        {/* Footer — creative, integration-focused */}
        <div className="text-center shrink-0 space-y-1">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {AI_FIRST_MESSAGING.builtFor}
          </p>
          <p className="text-[11px] text-text-secondary/80">
            <span className="text-accent-heart/90 font-medium">OpenClaw integration</span> — skill on ClawHub. REST for LangChain, CrewAI, AutoGen, LangGraph. Same API for humans & agents.
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-[10px]">
            <Link href="/docs" className="text-accent-heart/90 hover:text-accent-heart transition-colors underline decoration-accent-heart/30 hover:decoration-accent-heart">
              API docs
            </Link>
            <span className="text-white/30">·</span>
            <Link href="/dashboard/api" className="text-accent-heart/90 hover:text-accent-heart transition-colors">
              Dashboard API
            </Link>
            <span className="text-white/30">·</span>
            <a href="https://docs.openclaw.ai/" target="_blank" rel="noopener noreferrer" className="text-accent-heart/90 hover:text-accent-heart transition-colors">
              OpenClaw docs
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
