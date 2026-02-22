"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Agent {
  id: string;
  name: string;
  slug: string;
  protocols: string[];
}

export function HomeExploreSection() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/search?sort=popularity&limit=8")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.results) {
          setAgents(data.results);
        }
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className="w-full max-w-3xl mt-10 sm:mt-12 px-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3 text-center">
        Explore 5,000+ agents
      </h2>
      {loading ? (
        <div className="flex gap-2 overflow-hidden justify-center flex-wrap">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-9 w-24 rounded-lg bg-[var(--bg-elevated)]/50 animate-pulse"
              aria-hidden
            />
          ))}
        </div>
      ) : agents.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-2 justify-center flex-wrap scrollbar-none">
          {agents.map((agent) => {
            const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
            return (
              <Link
                key={agent.id}
                href={`/agent/${agent.slug}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg neural-glass border border-white/[0.08] hover:border-[var(--accent-heart)]/30 text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-all text-sm font-medium whitespace-nowrap shrink-0 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
              >
                <span className="truncate max-w-[120px]">{agent.name}</span>
                {protos.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--text-quaternary)]">
                    {protos[0]}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
