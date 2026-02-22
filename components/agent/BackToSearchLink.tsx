"use client";

import { useRouter } from "next/navigation";

const SEARCH_FALLBACK = "/?q=discover";

export function BackToSearchLink() {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(SEARCH_FALLBACK);
    }
  };

  return (
    <a
      href={SEARCH_FALLBACK}
      onClick={handleClick}
      className="text-[var(--accent-heart)] hover:text-[var(--accent-heart)]/90 mb-6 inline-block text-sm font-medium transition-colors"
    >
      ← Back to search
    </a>
  );
}
