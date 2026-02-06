import Link from "next/link";
import { signOut } from "@/lib/auth";

export function Header({
  user,
}: {
  user: { id?: string; email?: string | null; name?: string | null };
}) {
  const isGuest = user?.email?.endsWith("@xpersona.guest");

  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-card)]">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          xpersona
          <span className="text-[var(--accent-heart)]" aria-hidden>
            ♥
          </span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Home
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Dashboard
          </Link>
          <span className="text-sm text-[var(--text-secondary)]">
            {isGuest ? "Guest" : user?.email}
          </span>
          {isGuest ? (
            <Link
              href="/api/auth/guest/signout"
              className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-matte)]"
            >
              Sign out
            </Link>
          ) : (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-matte)]"
              >
                Sign out
              </button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
