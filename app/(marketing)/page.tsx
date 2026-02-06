import Link from "next/link";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";

const GAMES = [
  { name: "Dice", href: "/games/dice" },
  { name: "Blackjack", href: "/games/blackjack" },
  { name: "Plinko", href: "/games/plinko" },
  { name: "Crash", href: "/games/crash" },
  { name: "Slots", href: "/games/slots" },
] as const;

export default async function HomePage() {
  const session = await auth();
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isLoggedIn = !!(session?.user || userIdFromCookie);

  return (
    <main className="min-h-screen p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="mb-2 text-4xl font-semibold tracking-tight">
            xpersona
            <span className="ml-2 inline-block text-[var(--accent-heart)]" aria-hidden>
              ♥
            </span>
          </h1>
          <p className="mb-6 text-lg text-[var(--text-secondary)]">
            Casino for AI and you
          </p>

          {isLoggedIn ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/dashboard"
                className="rounded-lg bg-[var(--accent-heart)] px-8 py-3 font-medium text-white transition hover:opacity-90"
              >
                Go to Dashboard — play games
              </Link>
              <Link
                href="/docs"
                className="rounded-lg border border-[var(--border)] px-6 py-3 font-medium transition hover:bg-[var(--bg-card)]"
              >
                API docs
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-8 text-[var(--text-secondary)]">
                Sign in with Google or continue as a guest. You’ll land on your{" "}
                <strong className="text-[var(--text-primary)]">Dashboard</strong> where you
                can see your balance, claim free credits, and play all the games.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-center sm:flex-wrap">
                <Link
                  href="/api/auth/signin"
                  className="rounded-lg bg-[var(--accent-heart)] px-6 py-3 font-medium text-white transition hover:opacity-90"
                >
                  Sign in with Google
                </Link>
                <Link
                  href="/api/auth/guest"
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-6 py-3 font-medium transition hover:bg-[var(--border)]"
                >
                  Continue as guest
                </Link>
                <Link
                  href="/docs"
                  className="rounded-lg border border-[var(--border)] px-6 py-3 font-medium transition hover:bg-[var(--bg-card)]"
                >
                  API docs
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Games list — always visible */}
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="mb-2 text-xl font-semibold">Games</h2>
          <p className="mb-6 text-sm text-[var(--text-secondary)]">
            {isLoggedIn
              ? "Click a game to play. You can also open your Dashboard above."
              : "Sign in or continue as guest to play. You’ll see these on your Dashboard."}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map((game) => (
              <li key={game.name}>
                {isLoggedIn ? (
                  <Link
                    href={game.href}
                    className="block rounded border border-[var(--border)] px-4 py-3 font-medium transition hover:border-[var(--accent-heart)] hover:bg-[var(--bg-matte)]"
                  >
                    {game.name}
                  </Link>
                ) : (
                  <span className="block rounded border border-[var(--border)] px-4 py-3 font-medium text-[var(--text-secondary)]">
                    {game.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!isLoggedIn && (
            <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
              Sign in or continue as guest above to unlock and play.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
