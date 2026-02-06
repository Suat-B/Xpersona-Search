import Link from "next/link";

export function GameCard({ name, href }: { name: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 transition hover:border-[var(--accent-heart)]"
    >
      <span className="font-medium">{name}</span>
    </Link>
  );
}
