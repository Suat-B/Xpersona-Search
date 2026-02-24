"use client";

import { useRouter } from "next/navigation";

interface BackToSearchLinkProps {
  from?: string | null;
}

function isSafeInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export function BackToSearchLink({ from }: BackToSearchLinkProps) {
  const router = useRouter();
  const target = from && isSafeInternalPath(from) ? from : null;

  return (
    <button
      type="button"
      onClick={() => {
        if (target) {
          router.push(target);
          return;
        }
        router.back();
      }}
      className="text-[var(--accent-heart)] hover:text-[var(--accent-heart)]/90 inline-block text-sm font-medium transition-colors"
    >
      Back to search
    </button>
  );
}
