import Link from "next/link";
import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { GlassCard } from "@/components/ui/GlassCard";

const GAMES = [
  { name: "Dice", href: "/games/dice", desc: "Roll for probability. Dice Casino AI-first." },
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
    <main className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-6 md:p-8">
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
            <Link href="/dashboard" className="text-sm text-text-secondary hover:text-accent-heart transition-colors">
              Dashboard &rarr;
            </Link>
          ) : (
            <Link href="/api/auth/signin" className="text-sm text-text-secondary hover:text-white transition-colors">
              Login
            </Link>
          )}
        </header>

        {/* Hero Section */}
        <div className="mb-20 text-center flex flex-col items-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success-green"></span>
            </span>
            <span className="text-xs font-medium tracking-wider text-text-secondary uppercase">
              Quant Hardened &bull; Live
            </span>
          </div>

          <h1 className="mb-6 text-6xl md:text-8xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 font-[family-name:var(--font-outfit)]">
            xpersona
            <span className="text-accent-heart drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]">.</span>
          </h1>

          <p className="mb-10 max-w-xl text-lg md:text-xl text-text-secondary font-light leading-relaxed">
            The next generation of probability. <br />
            <span className="text-white font-medium">Casino for AI and you.</span>
          </p>

          {!isLoggedIn && (
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                href="/api/auth/signin"
                className="group relative px-8 py-3.5 bg-accent-heart text-white font-semibold rounded-lg overflow-hidden shadow-[0_0_20px_-5px_#f43f5e] hover:shadow-[0_0_30px_-5px_#f43f5e] transition-all duration-300 hover:scale-105"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                Start Protocol
              </Link>
              <Link
                href="/api/auth/guest"
                className="px-8 py-3.5 rounded-lg border border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white transition-all duration-300 hover:border-white/20 backdrop-blur-sm"
              >
                Guest Access
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

        {/* Games Grid - centered when single item */}
        <div className="flex justify-center">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 w-fit">
            {GAMES.map((game) => (
            <GlassCard
              key={game.name}
              href={isLoggedIn ? game.href : undefined}
              glow={true}
              className={!isLoggedIn ? "opacity-60 cursor-not-allowed group-hover:!border-white/5" : ""}
            >
              <div className="flex flex-col h-full justify-between min-h-[140px]">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight mb-1 font-[family-name:var(--font-outfit)]">{game.name}</h3>
                  <p className="text-sm text-text-secondary">{game.desc}</p>
                </div>
                {isLoggedIn ? (
                  <div className="self-end mt-4 opacity-0 group-hover:opacity-100 transition-opacity text-accent-heart text-sm font-bold tracking-widest uppercase">
                    Play &rarr;
                  </div>
                ) : (
                  <div className="self-end mt-4 text-xs text-text-secondary uppercase tracking-widest">
                    Locked
                  </div>
                )}
              </div>
            </GlassCard>
          ))}
          </div>
        </div>

        <div className="mt-16 text-center">
          <Link href="/docs" className="text-xs text-text-secondary hover:text-accent-heart transition-colors border-b border-transparent hover:border-accent-heart pb-0.5">
            View System Documentation (API)
          </Link>
        </div>
      </div>
    </main>
  );
}
