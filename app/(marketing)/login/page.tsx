import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  let session = null;
  try {
    session = await auth();
  } catch {
    // e.g. DB/adapter error
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isLoggedIn = !!(session?.user || userIdFromCookie);

  if (isLoggedIn) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const authError = params?.error;
  const hasGoogleProvider = !!(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );

  const signInUrl = "/api/auth/signin/google?callbackUrl=%2Fdashboard";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-deep)] relative overflow-hidden">
      {/* Subtle gradient behind card */}
      <div
        className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[var(--accent-heart)]/5 via-transparent to-transparent"
        aria-hidden
      />

      <div className="w-full max-w-md relative z-10">
        <div className="backdrop-blur-md border border-white/10 rounded-xl p-8 bg-[var(--bg-card)] shadow-xl">
          {/* Live pill */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success-green" />
            </span>
            <span className="text-xs font-medium tracking-wider text-text-secondary uppercase">
              Live
            </span>
          </div>

          {/* Logo */}
          <h1 className="mb-2 text-3xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/80 font-[family-name:var(--font-outfit)]">
            xpersona
            <span className="text-accent-heart drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]">.</span>
          </h1>
          <p className="mb-6 text-sm text-text-secondary">
            Sign in to play dice and manage your balance.
          </p>

          {/* Auth error from NextAuth */}
          {authError && (
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <p className="font-medium">Sign-in error</p>
              <p className="mt-1 opacity-90">
                {authError === "OAuthAccountNotLinked"
                  ? "This email is already used with another sign-in method."
                  : authError === "OAuthCallback"
                    ? "Something went wrong during sign-in."
                    : "Please try again or use guest access."}
              </p>
            </div>
          )}

          {hasGoogleProvider ? (
            <Link
              href={signInUrl}
              className="group relative flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-accent-heart text-white font-semibold rounded-lg overflow-hidden shadow-[0_0_20px_-5px_#f43f5e] hover:shadow-[0_0_30px_-5px_#f43f5e] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="relative">Sign in with Google</span>
            </Link>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-secondary">
              <p className="font-medium text-[var(--text-primary)]">Google sign-in is not configured.</p>
              <p className="mt-1">Use guest access on the home page or connect via the API.</p>
              <Link
                href="/"
                className="mt-3 inline-block text-sm font-medium text-accent-heart hover:underline"
              >
                Back to home
              </Link>
            </div>
          )}

          {/* Secondary links */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
            <Link
              href="/"
              className="text-text-secondary hover:text-white transition-colors"
            >
              Back to home
            </Link>
            <span className="text-[var(--border)]">·</span>
            <Link
              href="/docs"
              className="text-text-secondary hover:text-accent-heart transition-colors"
            >
              OpenClaw API
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
