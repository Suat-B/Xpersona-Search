import Link from "next/link";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error ?? "Default";

  const config =
    error === "AccessDenied"
      ? {
          title: "Access denied",
          description: "You don't have permission to sign in with this account.",
          primary: { label: "Try again", href: "/auth/signin?callbackUrl=/dashboard" },
          secondary: { label: "Dashboard", href: "/dashboard" },
        }
      : {
          title: "Sign-in hiccup",
          description: "Something went wrong during sign-in. Please try again.",
          primary: { label: "Try again", href: "/auth/signin?callbackUrl=/dashboard" },
          secondary: { label: "Dashboard", href: "/dashboard" },
        };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-deep)]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[var(--bg-card)] p-8 shadow-2xl shadow-black/30">
        <div className="flex flex-col items-center text-center gap-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/25 text-amber-400">
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {config.title}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {config.description}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Link
              href={config.primary.href}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-heart)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              {config.primary.label}
            </Link>
            <Link
              href={config.secondary.href}
              className="flex-1 inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
            >
              {config.secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
