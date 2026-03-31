import React from "react";
import Link from "next/link";
import { AgentMiniCard } from "@/components/agent/AgentMiniCard";
import type { HubAgent } from "@/lib/agents/hub-data";

type AgentGridSectionProps = {
  id?: string;
  title: string;
  description?: string;
  href?: string;
  agents: HubAgent[];
};

export function AgentGridSection({ id, title, description, href, agents }: AgentGridSectionProps) {
  return (
    <section
      id={id}
      className="rounded-[2rem] border border-[var(--border)] bg-[linear-gradient(180deg,var(--bg-card),var(--bg-elevated))] p-5 md:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Agent Collection</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{title}</h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--accent-heart)]/30"
          >
            View all
          </Link>
        ) : null}
      </div>
      {agents.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">No agents available yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((agent) => (
            <AgentMiniCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </section>
  );
}
