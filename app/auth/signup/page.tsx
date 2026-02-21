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

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const link = searchParams?.get("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? "Sign up failed. Please try again.");
        setLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Account created. Please sign in.");
        setLoading(false);
        return;
      }

      // Perform link immediately after sign-in, before any navigation.
      // This ensures the agent/guest cookie is still present (same document, no redirect).
      // Previously the link ran on profile page load and could fail if cookies were lost during navigation.
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

      const service =
        typeof window !== "undefined"
          ? getServiceFromHost(window.location.host, searchParams ?? undefined)
          : "hub";
      const redirectPath = getPostSignInRedirectPath(service, null, link);
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Create account</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Sign up with email to save your progress and API key
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
              <label htmlFor="name" className={labelClass}>
                Name <span className="text-[var(--text-tertiary)]">(optional)</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
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
              className="w-full rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white hover:opacity-95 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)] focus:ring-offset-2 focus:ring-offset-white"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Creating account…
                </span>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="text-sm text-[var(--text-secondary)] text-center">
            Already have an account?{" "}
            <Link
              href={link ? `/auth/signin?link=${link}` : "/auth/signin"}
              className="font-medium text-[var(--accent-heart)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-heart)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
