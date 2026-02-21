"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:border-[var(--accent-heart)]/50 transition-colors";
const labelClass =
  "block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const link = searchParams?.get("link");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.message?.toLowerCase().includes("invalid") || data.message?.toLowerCase().includes("expired")) {
          setTokenInvalid(true);
        }
        setError(data.message ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      const signInHref = link ? `/auth/signin?link=${link}&reset=success` : "/auth/signin?reset=success";
      router.push(signInHref);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const signInHref = link ? `/auth/signin?link=${link}` : "/auth/signin";
  const forgotHref = link ? `/auth/forgot-password?link=${link}` : "/auth/forgot-password";

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-deep)]">
        <div className="w-full max-w-md agent-card rounded-2xl border border-[var(--border)] p-8 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ff453a]/15 border border-[#ff453a]/25 text-[#ff453a]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Invalid link</h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                This reset link is missing a token. Please request a new one.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href={forgotHref}
                className="text-sm font-medium text-[var(--accent-heart)] hover:underline"
              >
                Request new reset link
              </Link>
              <Link href={signInHref} className="text-sm font-medium text-[var(--text-secondary)] hover:underline">
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (tokenInvalid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-deep)]">
        <div className="w-full max-w-md agent-card rounded-2xl border border-[var(--border)] p-8 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ff453a]/15 border border-[#ff453a]/25 text-[#ff453a]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Link expired or invalid</h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                This reset link may have expired or already been used. Please request a new one.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                href={forgotHref}
                className="text-sm font-medium text-[var(--accent-heart)] hover:underline"
              >
                Request new reset link
              </Link>
              <Link href={signInHref} className="text-sm font-medium text-[var(--text-secondary)] hover:underline">
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Set new password</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Enter your new password below
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className={labelClass}>
                New password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className={labelClass}>
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                required
                minLength={8}
                autoComplete="new-password"
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
                  Resetting…
                </span>
              ) : (
                "Reset password"
              )}
            </button>
          </form>

          <p className="text-sm text-[var(--text-secondary)] text-center">
            <Link href={forgotHref} className="font-medium text-[var(--accent-heart)] hover:underline">
              Request a new link
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)]">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-heart)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
