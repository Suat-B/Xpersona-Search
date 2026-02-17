"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:border-[var(--accent-heart)]/50 transition-colors";
const labelClass = "block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") ?? "/dashboard";
  const link = searchParams?.get("link");
  const effectiveCallback =
    link === "agent"
      ? "/dashboard/profile?link_agent=1"
      : link === "guest"
        ? "/dashboard/profile?link_guest=1"
        : callbackUrl;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: effectiveCallback,
      });

      if (result?.error) {
        setError("Invalid email or password. Please try again.");
        setLoading(false);
        return;
      }

      // Perform link immediately after sign-in, before any navigation.
      // Ensures agent/guest cookie is still present (avoids redirect loop / lost merge).
      if (link === "agent" || link === "guest") {
        const linkEndpoint = link === "agent" ? "/api/auth/link-agent" : "/api/auth/link-guest";
        const linkRes = await fetch(linkEndpoint, {
          method: "POST",
          credentials: "include",
        });
        const linkData = await linkRes.json().catch(() => ({}));
        if (linkData.success) {
          window.dispatchEvent(new Event("balance-updated"));
        }
      }

      const redirectTo = link === "agent" || link === "guest" ? "/dashboard/profile" : effectiveCallback;
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-deep)]">
      <div className="w-full max-w-md agent-card rounded-2xl border border-[var(--border)] p-8 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-heart)]/15 border border-[var(--accent-heart)]/25 text-[var(--accent-heart)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Sign in</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Sign in with your email and password
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            {error && (
              <p className="text-sm text-[#ff453a] bg-[#ff453a]/10 border border-[#ff453a]/20 rounded-xl px-4 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white hover:opacity-95 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)] focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="text-sm text-[var(--text-secondary)] text-center">
            Don&apos;t have an account?{" "}
            <Link
              href={link ? `/auth/signup?link=${link}` : "/auth/signup"}
              className="font-medium text-[var(--accent-heart)] hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)]">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-heart)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
