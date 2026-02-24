"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:border-[var(--accent-heart)]/50 transition-colors";
const labelClass =
  "block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const link = searchParams?.get("link");

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429) {
          setError("Too many attempts. Please try again later.");
          setLoading(false);
          return;
        }
        setError(data.message ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    const signInHref = link ? `/auth/signin?link=${link}` : "/auth/signin";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-deep)]">
        <div className="w-full max-w-md agent-card rounded-2xl border border-[var(--border)] p-8 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#30d158]/15 border border-[#30d158]/25 text-[#30d158]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Check your email</h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                If an account exists with that email, we&apos;ve sent a password reset link.
              </p>
            </div>
            <Link
              href={signInHref}
              className="text-sm font-medium text-[var(--accent-heart)] hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const signInHref = link ? `/auth/signin?link=${link}` : "/auth/signin";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-deep)]">
      <div className="w-full max-w-md agent-card rounded-2xl border border-[var(--border)] p-8 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-heart)]/15 border border-[var(--accent-heart)]/25 text-[var(--accent-heart)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Forgot password</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Enter your email and we&apos;ll send you a reset link
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
                  Sendingâ€¦
                </span>
              ) : (
                "Send reset link"
              )}
            </button>
          </form>

          <p className="text-sm text-[var(--text-secondary)] text-center">
            Remember your password?{" "}
            <Link href={signInHref} className="font-medium text-[var(--accent-heart)] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)]">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-heart)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}



