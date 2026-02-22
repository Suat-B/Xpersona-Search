"use client";

import Link from "next/link";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  url?: string;
  homepage?: string | null;
  source?: string;
  sourceId?: string;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData?: { stars?: number; forks?: number };
  npmData?: { packageName?: string };
}

interface Props {
  agent: Agent;
  /** Optional animation classes for staggered entrance */
  className?: string;
}

interface Sitelink {
  title: string;
  href: string;
  snippet?: string;
}

const DISPLAY_BASE = "xpersona.co";

function getDisplayUrl(slug: string): string {
  return `${DISPLAY_BASE}/agent/${slug}`;
}

function getSitelinks(agent: Agent): Sitelink[] {
  const links: Sitelink[] = [];
  const seenHrefs = new Set<string>();

  const add = (link: Sitelink) => {
    const normalized = link.href.replace(/\/$/, "");
    if (seenHrefs.has(normalized)) return;
    seenHrefs.add(normalized);
    links.push(link);
  };

  if (agent.url?.includes("github.com")) {
    add({ title: "View on GitHub", href: agent.url, snippet: "Source code and documentation" });
  }
  if (agent.source === "NPM" && (agent.npmData?.packageName ?? agent.name)) {
    const pkg = agent.npmData?.packageName ?? agent.name;
    add({ title: "npm package", href: `https://www.npmjs.com/package/${encodeURIComponent(pkg)}` });
  }
  if (agent.source === "PYPI") {
    const pkg = agent.sourceId?.replace(/^pypi:/, "") ?? agent.name;
    add({ title: "View on PyPI", href: `https://pypi.org/project/${encodeURIComponent(pkg)}` });
  }
  if (agent.source === "CLAWHUB" && agent.url) {
    add({ title: "View on ClawHub", href: agent.url });
  }
  if (agent.source === "HUGGINGFACE" && agent.url) {
    add({ title: "Hugging Face Space", href: agent.url });
  }
  if (agent.homepage) {
    add({ title: "Official website", href: agent.homepage });
  }
  if (agent.url && links.length === 0) {
    add({ title: "View source", href: agent.url });
  }
  return links.slice(0, 5);
}

export function SearchResultSnippet({ agent, className }: Props) {
  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
  const displayUrl = getDisplayUrl(agent.slug);
  const sitelinks = getSitelinks(agent);

  return (
    <article className={`py-4 border-b border-[var(--border)] last:border-b-0 group ${className ?? ""}`}>
      <Link
        href={`/agent/${agent.slug}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-heart)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-deep)] rounded"
      >
        <h3 className="text-lg font-medium text-[var(--accent-heart)] group-hover:underline decoration-[var(--accent-heart)] underline-offset-2 truncate">
          {agent.name}
        </h3>
      </Link>
      <p className="text-sm text-[var(--text-tertiary)] mt-0.5 truncate">
        {displayUrl}
      </p>
      <p className="text-[var(--text-secondary)] text-sm mt-1 line-clamp-2">
        {agent.description || "No description available."}
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[var(--text-quaternary)]">
        {protos.map((p) => (
          <span
            key={p}
            className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-white/[0.06]"
          >
            {p}
          </span>
        ))}
        {agent.safetyScore < 50 && (
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Pending review
          </span>
        )}
        <span className="text-[var(--text-quaternary)]">·</span>
        <span>Safety {agent.safetyScore}/100</span>
        <span className="text-[var(--text-quaternary)]">·</span>
        <span>Rank {agent.overallRank.toFixed(1)}</span>
        {(agent.githubData?.stars ?? 0) > 0 && (
          <>
            <span className="text-[var(--text-quaternary)]">·</span>
            <span>⭐ {agent.githubData?.stars}</span>
          </>
        )}
      </div>

      {sitelinks.length > 0 && (
        <div className="mt-3 ml-4 pl-4 border-l-2 border-[var(--border)] space-y-1.5">
          {sitelinks.map((link) => {
            const isExternal = link.href.startsWith("http");
            const linkContent = (
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-[var(--text-secondary)] group-hover/link:text-[var(--accent-heart)] transition-colors truncate">
                  {link.title}
                </span>
                {link.snippet && (
                  <span className="text-xs text-[var(--text-quaternary)] truncate hidden sm:inline flex-1 min-w-0">
                    {link.snippet}
                  </span>
                )}
                <span className="text-[var(--text-quaternary)] flex-shrink-0 group-hover/link:text-[var(--accent-heart)]">
                  &gt;
                </span>
              </span>
            );
            if (isExternal) {
              return (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex group/link block hover:underline underline-offset-1 min-w-0"
                  aria-label={`${link.title}${link.snippet ? `: ${link.snippet}` : ""}`}
                >
                  {linkContent}
                </a>
              );
            }
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex group/link block hover:underline underline-offset-1 min-w-0"
                aria-label={link.title}
              >
                {linkContent}
              </Link>
            );
          })}
        </div>
      )}
    </article>
  );
}
