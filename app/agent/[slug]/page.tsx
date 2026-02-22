import { notFound } from "next/navigation";
import { ProtocolBadge } from "@/components/search/ProtocolBadge";
import { BackToSearchLink } from "@/components/agent/BackToSearchLink";
import { SafetyBadge } from "@/components/search/SafetyBadge";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AgentPage({ params }: Props) {
  const { slug } = await params;
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const res = await fetch(`${baseUrl}/api/agents/${slug}`, {
    cache: "no-store",
  });
  if (!res.ok) notFound();
  const agent = await res.json();

  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
  const github = agent.githubData ?? {};

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <BackToSearchLink />
        <h1 className="text-4xl font-bold mb-2">{agent.name}</h1>
        <div className="flex flex-wrap gap-2 mb-4">
          {protos.map((p: string) => (
            <ProtocolBadge key={p} protocol={p} />
          ))}
        </div>
        <p className="text-slate-400 mb-6">{agent.description}</p>
        <div className="flex gap-6 mb-6">
          <SafetyBadge score={agent.safetyScore} />
          <span>⭐ {github.stars ?? 0} stars</span>
          <span>Rank: {agent.overallRank?.toFixed(1) ?? 0}/100</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          {caps.map((c: string) => (
            <span
              key={c}
              className="px-3 py-1 rounded-full bg-slate-700 text-sm"
            >
              {c}
            </span>
          ))}
        </div>
        <a
          href={agent.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
        >
          View on GitHub →
        </a>
        {agent.readme && (
          <div className="mt-8 p-6 rounded-xl bg-slate-800">
            <h2 className="text-lg font-semibold mb-4">README</h2>
            <pre className="whitespace-pre-wrap text-sm text-slate-300 overflow-x-auto">
              {agent.readme.slice(0, 2000)}
              {agent.readme.length > 2000 ? "..." : ""}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
