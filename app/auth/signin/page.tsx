"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { getServiceFromHost } from "@/lib/subdomain";
import { getPostSignInRedirectPath } from "@/lib/post-sign-in-redirect";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:border-[var(--accent-heart)]/50 transition-colors";
const labelClass = "block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5";
type LinkFlow = "agent" | "guest";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") ?? undefined;
  const link = searchParams?.get("link");
  const resetSuccess = searchParams?.get("reset") === "success";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const buildAuthHref = (basePath: "/auth/forgot-password" | "/auth/signup") => {
    const params = new URLSearchParams();
    if (link) params.set("link", link);
    if (callbackUrl) params.set("callbackUrl", callbackUrl);
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const attemptLinkFlow = async (
    flow: LinkFlow
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    const primary =
      flow === "agent" ? "/api/auth/link-agent" : "/api/auth/link-guest";
    const fallback =
      flow === "agent" ? "/api/auth/link-guest" : "/api/auth/link-agent";

    for (const endpoint of [primary, fallback]) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          return { ok: true };
        }
      } catch {
        // Continue to fallback endpoint
      }
    }

    return {
      ok: false,
      message:
        "We could not link your temporary account. Please try again or contact support if this keeps happening.",
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const service =
        typeof window !== "undefined"
          ? getServiceFromHost(window.location.host, searchParams ?? undefined)
          : "hub";

      const redirectPath = getPostSignInRedirectPath(service, callbackUrl, link);

      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: redirectPath,
      });

      if (result?.error) {
        setError("Invalid email or password. Please try again.");
        setLoading(false);
        return;
      }

      // Perform link immediately after sign-in, before any navigation.
      // Ensures agent/guest cookie is still present (avoids redirect loop / lost merge).
      if (link === "agent" || link === "guest") {
        const linkResult = await attemptLinkFlow(link);
        if (!linkResult.ok) {
          setError(linkResult.message);
          setLoading(false);
          return;
        }
      }
      window.dispatchEvent(new Event("balance-updated"));

      router.push(redirectPath);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
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

          {resetSuccess && (
            <p className="text-sm text-[#30d158] bg-[#30d158]/10 border border-[#30d158]/20 rounded-xl px-4 py-2">
              Password reset successful. You can now sign in.
            </p>
          )}

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
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className={labelClass}>
                  Password
                </label>
                <Link
                  href={buildAuthHref("/auth/forgot-password")}
                  className="text-xs font-medium text-[var(--accent-heart)] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
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
              className="w-full rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white hover:opacity-95 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)] focus:ring-offset-2 focus:ring-offset-white"
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
              href={buildAuthHref("/auth/signup")}
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
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-heart)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
