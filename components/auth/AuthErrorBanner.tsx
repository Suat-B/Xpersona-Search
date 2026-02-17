"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type AuthErrorBannerProps = {
  error: string;
  message?: string | null;
};

function getErrorConfig(error: string, message?: string | null) {
  switch (error) {
    case "play_failed":
      return {
        title: "Session could not start",
        description: message && message !== "Something went wrong"
          ? message
          : "We couldn't start your session. This sometimes happens — try again in a moment.",
        cta: { label: "Try again", href: "/api/auth/play" },
      };
    case "guest_failed":
    case "human_failed":
      return {
        title: "Session creation failed",
        description: message ?? "We couldn't create your session. Please try again.",
        cta: { label: "Try again", href: "/api/auth/play" },
      };
    case "recovery_expired":
      return {
        title: "Recovery link expired",
        description: "This link has expired. Generate a new one from the dashboard.",
        cta: { label: "Start fresh as guest", href: "/api/auth/play" },
      };
    case "recovery_missing":
      return {
        title: "Recovery token missing",
        description: "The link may be incomplete. Please request a new recovery link.",
        cta: { label: "Start fresh as guest", href: "/api/auth/play" },
      };
    case "recovery_invalid":
      return {
        title: "Recovery failed",
        description: message ?? "We couldn't recover your account. Please try again.",
        cta: { label: "Start fresh as guest", href: "/api/auth/play" },
      };
    default:
      return {
        title: "Something went wrong",
        description: message ?? "Please try again or sign in with a different method.",
        cta: { label: "Try again", href: "/" },
      };
  }
}

export function AuthErrorBanner({ error, message }: AuthErrorBannerProps) {
  const router = useRouter();
  const config = getErrorConfig(error, message);

  const dismiss = () => {
    router.replace("/");
  };

  return (
    <div
      className="relative rounded-2xl border border-amber-500/25 bg-amber-500/5 backdrop-blur-sm overflow-hidden"
      role="alert"
    >
      {/* Subtle gradient accent */}
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.04] to-transparent pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/20">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-200">{config.title}</p>
            <p className="mt-0.5 text-sm text-amber-200/80 leading-relaxed">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 sm:pl-4">
          <Link
            href={config.cta.href}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 border border-amber-500/30 px-4 py-2.5 text-sm font-medium text-amber-200 hover:bg-amber-500/25 hover:border-amber-500/40 transition-colors"
          >
            {config.cta.label}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="p-2 rounded-lg text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
