"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { getServiceFromHost } from "@/lib/subdomain";
import { getPostSignInRedirectPath } from "@/lib/post-sign-in-redirect";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

const authInputClass =
  "w-full rounded-lg border border-[#dadce0] bg-white px-3 py-3 text-[#202124] placeholder:text-[#5f6368] transition-colors focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/20";
const authLabelClass = "mb-1.5 block text-sm font-medium text-[#202124]";
const authPrimaryButtonClass =
  "w-full rounded-full bg-[#1a73e8] px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#1669d6] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/50 disabled:cursor-not-allowed disabled:opacity-60";
const authSecondaryTextClass = "text-sm text-[#5f6368]";
type LinkFlow = "agent" | "guest";
type LinkApiErrorCode =
  | "NO_GUEST"
  | "NO_AGENT"
  | "INVALID_GUEST"
  | "INVALID_AGENT"
  | "AGENT_NOT_FOUND"
  | "NOT_AGENT_ACCOUNT";

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
      flow === "agent" ? "/api/v1/auth/link-agent" : "/api/v1/auth/link-guest";
    const fallback =
      flow === "agent" ? "/api/v1/auth/link-guest" : "/api/v1/auth/link-agent";

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
        const code = data?.error as LinkApiErrorCode | undefined;
        if (
          code === "NO_GUEST" ||
          code === "NO_AGENT" ||
          code === "INVALID_GUEST" ||
          code === "INVALID_AGENT" ||
          code === "AGENT_NOT_FOUND" ||
          code === "NOT_AGENT_ACCOUNT"
        ) {
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
    <AuthPageShell
      icon={
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
        </svg>
      }
      title="Sign in"
      subtitle="to continue to Xpersona"
      badgeText="Secure Access"
      formContent={
        <>
          {resetSuccess && (
            <p
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700"
              role="status"
              aria-live="polite"
            >
              Password reset successful. You can now sign in.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className={authLabelClass}>
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
                className={authInputClass}
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className={authLabelClass}>
                  Password
                </label>
                <Link href={buildAuthHref("/auth/forgot-password")} className="text-xs font-semibold text-[var(--accent-heart)] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="........"
                required
                autoComplete="current-password"
                className={authInputClass}
              />
            </div>

            {error && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className={authPrimaryButtonClass}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </>
      }
      footerContent={
        <p className={`${authSecondaryTextClass} text-center`}>
          Don&apos;t have an account?{" "}
          <Link href={buildAuthHref("/auth/signup")} className="font-semibold text-[var(--accent-heart)] hover:underline">
            Sign up
          </Link>
        </p>
      }
    />
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)]">
          <div className="h-8 w-8 rounded-full border-2 border-[var(--accent-heart)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}



