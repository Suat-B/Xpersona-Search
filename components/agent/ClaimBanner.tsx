"use client";

import Link from "next/link";

interface ClaimBannerProps {
  slug: string;
  claimStatus: string;
  isOwner: boolean;
}

export function ClaimBanner({ slug, claimStatus, isOwner }: ClaimBannerProps) {
  if (claimStatus === "CLAIMED" && isOwner) {
    return (
      <div className="rounded-xl border border-[#30d158]/25 bg-[#30d158]/5 px-5 py-4 mb-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#30d158]/15">
              <svg className="h-4 w-4 text-[#30d158]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm font-medium text-[#30d158]">
              You are the verified owner of this page
            </span>
          </div>
          <Link
            href={`/agent/${slug}/manage`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#30d158]/30 bg-[#30d158]/10 px-4 py-2 text-xs font-semibold text-[#30d158] hover:bg-[#30d158]/20 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Manage Page
          </Link>
        </div>
      </div>
    );
  }

  if (claimStatus === "PENDING") {
    return (
      <div className="rounded-xl border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/5 px-5 py-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-warning)]/15">
            <svg className="h-4 w-4 text-[var(--accent-warning)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-sm text-[var(--text-secondary)]">
            A claim is pending verification for this page.
          </span>
        </div>
      </div>
    );
  }

  if (claimStatus === "CLAIMED" && !isOwner) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/50 px-5 py-4 mb-8 backdrop-blur-sm">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20">
            <svg className="h-4 w-4 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Are you the developer?
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Claim this page to manage it and get a verified badge.
            </p>
          </div>
        </div>
        <Link
          href={`/agent/${slug}/claim`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-heart)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity shadow-sm"
        >
          Claim this page
        </Link>
      </div>
    </div>
  );
}
