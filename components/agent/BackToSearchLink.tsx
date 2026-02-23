"use client";

import Link from "next/link";

const SEARCH_URL = "/?q=discover";

export function BackToSearchLink() {
  return (
    <Link
      href={SEARCH_URL}
      className="text-[var(--accent-heart)] hover:text-[var(--accent-heart)]/90 inline-block text-sm font-medium transition-colors"
    >
      ← Back to search
    </Link>
  );
}
