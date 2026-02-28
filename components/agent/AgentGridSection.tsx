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
    <section id={id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="text-sm font-medium text-[var(--accent-heart)] hover:underline"
          >
            View all
          </Link>
        ) : null}
      </div>
      {agents.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">No agents available yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {agents.map((agent) => (
            <AgentMiniCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </section>
  );
}

