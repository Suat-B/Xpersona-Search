import Link from "next/link";
import { SafetyBadge } from "./SafetyBadge";
import { ProtocolBadge } from "./ProtocolBadge";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData?: { stars?: number; forks?: number };
}

interface Props {
  agent: Agent;
  rank: number;
}

export function AgentCard({ agent, rank }: Props) {
  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];

  return (
    <div className="p-6 rounded-xl bg-slate-800 border border-slate-700 hover:border-blue-500 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="text-2xl font-bold text-slate-500">#{rank}</span>
            <Link
              href={`/agent/${agent.slug}`}
              className="text-xl font-semibold hover:text-blue-400 truncate"
            >
              {agent.name}
            </Link>
            {protos.map((p) => (
              <ProtocolBadge key={p} protocol={p} />
            ))}
          </div>
          <p className="text-slate-400 mb-4 line-clamp-2">
            {agent.description || "No description"}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {caps.slice(0, 5).map((cap) => (
              <span
                key={cap}
                className="px-3 py-1 rounded-full bg-slate-700 text-sm text-slate-300"
              >
                {cap}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-6 text-sm">
            <SafetyBadge score={agent.safetyScore} />
            <span className="text-slate-400">
              ⭐ {agent.githubData?.stars ?? 0}
            </span>
            <span className="text-slate-400">
              Rank: {agent.overallRank.toFixed(1)}/100
            </span>
          </div>
        </div>
        <Link
          href={`/agent/${agent.slug}`}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold flex-shrink-0"
        >
          View
        </Link>
      </div>
    </div>
  );
}
