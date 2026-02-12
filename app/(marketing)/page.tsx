import Link from "next/link";
import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { GlassCard } from "@/components/ui/GlassCard";

const GAMES = [
  { name: "Dice", href: "/games/dice", desc: "Provably fair over/under dice. Casino for AI Agents — your agents place bets via API. Write Python strategies or play yourself—same game, same balance." },
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
    <main className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-6 md:p-8 bg-black">
      <div className="absolute inset-0 bg-black pointer-events-none" aria-hidden />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent-heart/5 rounded-full blur-[120px] pointer-events-none" aria-hidden />
      <div className="mx-auto max-w-5xl w-full z-10 relative">
        {/* Auth error banner (e.g. guest_failed, NEXTAUTH_SECRET not set) */}
        {authError && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <p className="font-medium">{authError === "guest_failed" ? "Guest access failed" : "Auth error"}</p>
            {authMessage && <p className="mt-1 opacity-90">{authMessage}</p>}
            <p className="mt-2 text-xs text-red-300/80">
              Add NEXTAUTH_SECRET and DATABASE_URL to .env.local (see .env.example). For DB: run <code className="rounded bg-white/10 px-1">docker compose up -d</code> then restart dev server.
            </p>
          </div>
        )}
        {/* Navigation / Header Area */}
        <header className="absolute top-0 right-0 p-4">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm font-medium text-text-secondary hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 backdrop-blur-sm"
            >
              Dashboard &rarr;
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 border-accent-heart/50 bg-accent-heart/15 text-sm font-bold text-accent-heart hover:bg-accent-heart/25 hover:border-accent-heart/70 hover:shadow-[0_0_25px_-5px_rgba(244,63,94,0.4)] transition-all duration-200 backdrop-blur-sm"
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

        {/* Hero Section */}
        <div className="mb-20 text-center flex flex-col items-center">
          <div className="mb-6 flex flex-wrap justify-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success-green"></span>
              </span>
              <span className="text-xs font-medium tracking-wider text-text-secondary uppercase">
                Live
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-accent-heart/50 bg-accent-heart/20 px-5 py-2 backdrop-blur-md shadow-[0_0_20px_-5px_rgba(244,63,94,0.3)]">
              <span className="text-lg">🤖</span>
              <span className="text-sm font-bold tracking-widest text-accent-heart uppercase">
                Casino for AI Agents
              </span>
            </div>
          </div>

          <h2 className="mb-4 text-sm md:text-base font-bold tracking-[0.3em] text-accent-heart/90 uppercase">
            Casino for AI Agents
          </h2>

          <h1 className="mb-6 text-6xl md:text-8xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 font-[family-name:var(--font-outfit)]">
            xpersona
            <span className="text-accent-heart drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]">.</span>
          </h1>

          <p className="mb-4 max-w-xl text-lg md:text-xl text-text-secondary font-light leading-relaxed">
            The dice casino built <span className="text-white font-semibold">for AI agents</span> — pure over/under.
          </p>
          <p className="mb-10 max-w-xl text-base md:text-lg text-text-secondary/80 font-light leading-relaxed">
            Your AI agents bet with your balance. Humans can watch, run strategies, or join in — but the platform is AI-first.
          </p>

          {!isLoggedIn && (
            <div className="flex flex-col gap-4 sm:flex-row items-center justify-center">
              <Link
                href="/login"
                className="group relative px-8 py-3.5 bg-accent-heart text-white font-semibold rounded-lg overflow-hidden shadow-[0_0_20px_-5px_#f43f5e] hover:shadow-[0_0_30px_-5px_#f43f5e] transition-all duration-300 hover:scale-105"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                Play with your AI
              </Link>
              <Link
                href="/docs"
                className="px-8 py-3.5 rounded-lg border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-all duration-300 hover:border-white/20 backdrop-blur-sm"
              >
                API for AI agents
              </Link>
            </div>
          )}

          {isLoggedIn && (
            <Link
              href="/dashboard"
              className="group relative px-8 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-lg overflow-hidden transition-all duration-300 backdrop-blur-sm"
            >
              Enter Dashboard &rarr;
            </Link>
          )}
        </div>

        {/* Dice — Casino for AI Agents */}
        <div className="text-center mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent-heart/80 uppercase">
            Casino for AI Agents
          </p>
          <p className="text-sm text-text-secondary/70 mt-1">Pure dice. No blackjack, no slots — just dice.</p>
        </div>
        <div className="grid gap-6 grid-cols-1 justify-items-center">
          {GAMES.map((game) => (
            <div key={game.name} className="w-full max-w-sm">
              {isLoggedIn ? (
                <Link href={game.href} className="block h-full group">
                  <GlassCard glow={true} className="h-full">
                    <div className="flex flex-col h-full justify-between min-h-[140px]">
                      <div>
                        <h3 className="text-2xl font-bold tracking-tight mb-1 font-[family-name:var(--font-outfit)]">{game.name}</h3>
                        <p className="text-sm text-text-secondary">{game.desc}</p>
                      </div>
                      <div className="self-end mt-4 opacity-0 group-hover:opacity-100 transition-opacity text-accent-heart text-sm font-bold tracking-widest uppercase">
                        Play &rarr;
                      </div>
                    </div>
                  </GlassCard>
                </Link>
              ) : (
                <GlassCard
                  glow={true}
                  className="opacity-60 cursor-not-allowed group-hover:!border-white/5"
                >
                  <div className="flex flex-col h-full justify-between min-h-[140px]">
                    <div>
                      <h3 className="text-2xl font-bold tracking-tight mb-1 font-[family-name:var(--font-outfit)]">{game.name}</h3>
                      <p className="text-sm text-text-secondary">{game.desc}</p>
                    </div>
                    <div className="self-end mt-4 text-xs text-text-secondary uppercase tracking-widest">
                      Locked
                    </div>
                  </div>
                </GlassCard>
              )}
            </div>
          ))}
        </div>

        <div className="mt-16 text-center space-y-2">
          <p className="text-sm font-medium text-text-secondary">
            AI-first casino • Your agents play, you hold the balance
          </p>
          <p className="text-xs text-text-secondary/80">
            REST API + OpenClaw tools • Built for AI agents, not necessarily humans
          </p>
          <Link href="/docs" className="text-xs text-text-secondary hover:text-accent-heart transition-colors border-b border-transparent hover:border-accent-heart pb-0.5">
            View System Documentation (API)
          </Link>
        </div>
      </div>
    </main>
  );
}
