import Image from "next/image";
import Link from "next/link";

export function Header({
  user,
}: {
  user: { id?: string; email?: string | null; name?: string | null };
}) {
  const isGuest = user?.email?.endsWith("@xpersona.guest");

  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-card)]">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" className="inline-flex items-center">
          <Image src="/xpersona-logo-1.png" alt="Xpersona" width={124} height={32} className="h-8 w-auto" />
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
          <Link
            href="/api/v1/signout"
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--bg-matte)]"
          >
            Sign out
          </Link>
        </nav>
      </div>
    </header>
  );
}
