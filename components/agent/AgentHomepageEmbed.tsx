"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AgentEmbedProps {
  agent: {
    name: string;
    slug: string;
    homepage: string;
    description?: string | null;
    source?: string;
    url: string;
    claimStatus?: string | null;
  };
  from?: string | null;
}

function ensureExternalUrl(rawUrl: string | null | undefined): string {
  const url = (rawUrl ?? "").trim();
  if (!url) return "#";
  const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }
  const sshProtoMatch = url.match(/^ssh:\/\/git@([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshProtoMatch) {
    return `https://${sshProtoMatch[1]}/${sshProtoMatch[2]}`;
  }
  if (/^git:\/\//i.test(url)) return url.replace(/^git:\/\//i, "https://");
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return `https://${url}`;
}

function FallbackCard({ agent, from }: AgentEmbedProps) {
  const detailsHref = useMemo(() => {
    if (from && from.startsWith("/") && !from.startsWith("//")) {
      return `/agent/${agent.slug}?view=details&from=${encodeURIComponent(from)}`;
    }
    return `/agent/${agent.slug}?view=details`;
  }, [agent.slug, from]);
  const homepageHref = ensureExternalUrl(agent.homepage);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center shadow-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20">
          <svg className="h-8 w-8 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">{agent.name}</h2>
        {agent.description && (
          <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">{agent.description}</p>
        )}
        <p className="text-sm text-[var(--text-tertiary)] mb-6">
          This page cannot be displayed inline. Visit it directly instead.
        </p>
        <a
          href={homepageHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 rounded-xl font-semibold text-white transition-colors shadow-lg shadow-[var(--accent-heart)]/20"
        >
          Visit Homepage
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <div className="mt-4">
          <Link
            href={detailsHref}
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors underline underline-offset-2"
          >
            View agent details instead
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AgentHomepageEmbed({ agent, from }: AgentEmbedProps) {
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const router = useRouter();
  const safeFrom = from && from.startsWith("/") && !from.startsWith("//") ? from : null;
  const homepageHref = ensureExternalUrl(agent.homepage);
  const claimHref = safeFrom
    ? `/agent/${agent.slug}/claim?from=${encodeURIComponent(safeFrom)}`
    : `/agent/${agent.slug}/claim`;

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-deep)] overflow-hidden">
      {/* Top bar */}
      <header className="relative z-50 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-deep)]/95 backdrop-blur-md px-4">
        {/* Left: back to search */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (safeFrom) {
                router.push(safeFrom);
                return;
              }
              router.back();
            }}
            className="flex items-center gap-1.5 text-sm font-medium text-[var(--accent-heart)] hover:text-[var(--accent-heart)]/80 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Back to search</span>
            <span className="sm:hidden">Back</span>
          </button>
        </div>

        {/* Center: agent name */}
        <div className="flex-1 min-w-0 hidden md:flex justify-center">
          <span className="text-sm font-medium text-[var(--text-tertiary)] truncate max-w-xs">
            {agent.name}
          </span>
        </div>

        {/* Right: claim + open in new tab + logo */}
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          {(agent.claimStatus ?? "UNCLAIMED") !== "CLAIMED" && (
            <Link
              href={claimHref}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--accent-heart)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="hidden sm:inline">Claim this agent</span>
              <span className="sm:hidden">Claim</span>
            </Link>
          )}

          <div className="h-5 w-px bg-[var(--border)] shrink-0 hidden sm:block" />

          <a
            href={homepageHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <span className="hidden sm:inline">Open in new tab</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          <div className="h-5 w-px bg-[var(--border)] shrink-0 hidden sm:block" />

          <Link
            href="/"
            className="text-lg font-black tracking-tight text-white select-none logo-glow shrink-0"
          >
            Xpersona
          </Link>
        </div>
      </header>

      {/* Iframe zone */}
      {!iframeError ? (
        <div className="flex-1 relative">
          {/* Loading skeleton */}
          {!iframeLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-deep)]">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-[var(--accent-heart)]/30 border-t-[var(--accent-heart)] animate-spin" />
                <span className="text-sm text-[var(--text-tertiary)]">Loading {agent.name}...</span>
              </div>
            </div>
          )}
          <iframe
            src={homepageHref}
            title={`${agent.name} homepage`}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            onLoad={() => setIframeLoaded(true)}
            onError={() => setIframeError(true)}
          />
        </div>
      ) : (
        <FallbackCard agent={agent} from={safeFrom} />
      )}
    </div>
  );
}
