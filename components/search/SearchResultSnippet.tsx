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
  languages?: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData?: { stars?: number; forks?: number };
  npmData?: { packageName?: string; version?: string };
}

interface Props {
  agent: Agent;
  /** When true, render the sitelinks block. Only first result should pass true. */
  showSitelinks?: boolean;
  /** Optional animation classes for staggered entrance */
  className?: string;
}

interface Sitelink {
  title: string;
  href: string;
  snippet: string;
}

const DISPLAY_BASE = "xpersona.co";

function getDisplayUrl(slug: string): string {
  return `${DISPLAY_BASE}/agent/${slug}`;
}

function getSitelinks(agent: Agent): Sitelink[] {
  const links: Sitelink[] = [];
  const seenHrefs = new Set<string>();

  const add = (link: Sitelink) => {
    const normalized = link.href.replace(/\/$/, "").replace(/\.git$/, "").toLowerCase();
    if (seenHrefs.has(normalized)) return;
    seenHrefs.add(normalized);
    links.push(link);
  };

  add({
    title: "Full agent page",
    href: `/agent/${agent.slug}`,
    snippet: "Documentation, install commands, parameters, and examples.",
  });

  const ghBase = agent.url?.replace(/\.git$/, "").replace(/\/$/, "");
  if (ghBase?.includes("github.com")) {
    add({
      title: "View on GitHub",
      href: ghBase,
      snippet: "Browse source code, README, and contribution guidelines.",
    });
    add({
      title: "GitHub Issues",
      href: `${ghBase}/issues`,
      snippet: "Report bugs and track feature requests.",
    });
    add({
      title: "GitHub Releases",
      href: `${ghBase}/releases`,
      snippet: "Download releases and view changelog.",
    });
    add({
      title: "GitHub Pull requests",
      href: `${ghBase}/pulls`,
      snippet: "Open pull requests and review contributions.",
    });
  }
  if (agent.source === "NPM" && (agent.npmData?.packageName ?? agent.name)) {
    const pkg = agent.npmData?.packageName ?? agent.name;
    const ver = agent.npmData?.version ? ` — latest v${agent.npmData.version}` : "";
    add({
      title: "npm package",
      href: `https://www.npmjs.com/package/${encodeURIComponent(pkg)}`,
      snippet: `Install from npm registry${ver}.`,
    });
  }
  if (agent.source === "PYPI") {
    const pkg = agent.sourceId?.replace(/^pypi:/, "") ?? agent.name;
    add({
      title: "View on PyPI",
      href: `https://pypi.org/project/${encodeURIComponent(pkg)}`,
      snippet: "Python package installable via pip.",
    });
  }
  if (agent.source === "CLAWHUB" && agent.url) {
    add({
      title: "View on ClawHub",
      href: agent.url,
      snippet: "Official OpenClaw skill registry. Install with clawhub skill install.",
    });
  }
  if (agent.source === "HUGGINGFACE" && agent.url) {
    add({
      title: "Hugging Face Space",
      href: agent.url,
      snippet: "Live demo and model configs.",
    });
  }
  if (agent.homepage) {
    add({
      title: "Official website",
      href: agent.homepage,
      snippet: "Project homepage and docs.",
    });
  }
  if (agent.url && links.length === 1) {
    add({
      title: "View source",
      href: agent.url,
      snippet: "Original source repository or package page.",
    });
  }
  return links.slice(0, 10);
}

export function SearchResultSnippet({ agent, showSitelinks = false, className }: Props) {
  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const langs = Array.isArray(agent.languages) ? agent.languages : [];
  const displayUrl = getDisplayUrl(agent.slug);
  const sitelinks = showSitelinks ? getSitelinks(agent) : [];

  return (
    <article className={`py-5 border-b border-[var(--border)] last:border-b-0 group ${className ?? ""}`}>
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
      <p className="text-[var(--text-secondary)] text-sm mt-1.5 line-clamp-2">
        {agent.description || "No description available."}
      </p>

      {caps.length > 0 && (
        <p className="text-xs text-[var(--text-quaternary)] mt-2">
          <span className="font-medium text-[var(--text-tertiary)]">Capabilities:</span>{" "}
          {caps.slice(0, 5).join(", ")}{caps.length > 5 ? "..." : ""}
        </p>
      )}

      {langs.length > 0 && (
        <p className="text-xs text-[var(--text-quaternary)] mt-1">
          <span className="font-medium text-[var(--text-tertiary)]">Languages:</span>{" "}
          {langs.join(", ")}
        </p>
      )}

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
            <span>⭐ {agent.githubData?.stars} stars</span>
          </>
        )}
      </div>

      {sitelinks.length > 0 && (
        <div className="mt-4 ml-4 pl-4 border-l-2 border-[var(--accent-heart)]/30 space-y-2.5">
          {sitelinks.map((link) => {
            const isExternal = link.href.startsWith("http");

            if (isExternal) {
              return (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group/link min-w-0"
                  aria-label={`${link.title}: ${link.snippet}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium text-[var(--text-secondary)] group-hover/link:text-[var(--accent-heart)] transition-colors flex-shrink-0">
                      {link.title}
                    </span>
                    <span className="text-[var(--text-quaternary)] flex-shrink-0 group-hover/link:text-[var(--accent-heart)]">
                      &gt;
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-quaternary)] mt-0.5 group-hover/link:text-[var(--text-tertiary)] line-clamp-2">
                    {link.snippet}
                  </p>
                </a>
              );
            }
            return (
              <Link
                key={link.href}
                href={link.href}
                className="block group/link min-w-0"
                aria-label={`${link.title}: ${link.snippet}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium text-[var(--text-secondary)] group-hover/link:text-[var(--accent-heart)] transition-colors flex-shrink-0">
                    {link.title}
                  </span>
                  <span className="text-[var(--text-quaternary)] flex-shrink-0 group-hover/link:text-[var(--accent-heart)]">
                    &gt;
                  </span>
                </div>
                <p className="text-xs text-[var(--text-quaternary)] mt-0.5 group-hover/link:text-[var(--text-tertiary)] line-clamp-2">
                  {link.snippet}
                </p>
              </Link>
            );
          })}
          <Link
            href={`/agent/${agent.slug}`}
            className="inline-block text-xs text-[var(--text-quaternary)] hover:text-[var(--accent-heart)] mt-1 font-medium"
          >
            More from this agent →
          </Link>
        </div>
      )}
    </article>
  );
}
