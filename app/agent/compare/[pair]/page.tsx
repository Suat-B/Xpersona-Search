import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentsBySlugs } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

function parsePair(pair: string): { left: string; right: string } | null {
  const [left, right] = pair.split("-vs-");
  if (!left || !right) return null;
  return { left, right };
}

async function resolveCompareData(pair: string) {
  const parsed = parsePair(pair);
  if (!parsed) return null;
  const agents = await getAgentsBySlugs([parsed.left, parsed.right]);
  if (agents.length !== 2) return null;
  return { left: agents[0], right: agents[1] };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}): Promise<Metadata> {
  const { pair } = await params;
  const data = await resolveCompareData(pair);
  if (!data) {
    return {
      title: "Comparison not found",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${data.left.name} vs ${data.right.name} | Xpersona`,
    description: `Compare ${data.left.name} and ${data.right.name} on protocol, ranking, safety, and profile depth.`,
    alternates: { canonical: `${baseUrl}/agent/compare/${encodeURIComponent(pair)}` },
    robots: { index: true, follow: true },
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const data = await resolveCompareData(pair);
  if (!data) notFound();

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Which is better: ${data.left.name} or ${data.right.name}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: "Neither is universally better. Choose based on protocol compatibility, trust freshness, setup complexity, and your workload requirements.",
        },
      },
      {
        "@type": "Question",
        name: "How should I validate before final selection?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Run snapshot, contract, and trust checks for both options and verify reliability fit with your latency and risk constraints.",
        },
      },
    ],
  };

  const rows = [
    { label: "Overall rank", left: Math.round(data.left.overallRank), right: Math.round(data.right.overallRank) },
    { label: "Safety score", left: data.left.safetyScore, right: data.right.safetyScore },
    { label: "Source", left: data.left.source, right: data.right.source },
    { label: "Protocols", left: data.left.protocols.join(", ") || "-", right: data.right.protocols.join(", ") || "-" },
    { label: "Capabilities", left: data.left.capabilities.slice(0, 5).join(", ") || "-", right: data.right.capabilities.slice(0, 5).join(", ") || "-" },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Agent Comparison</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
          {data.left.name} vs {data.right.name}
        </h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Side-by-side comparison for selection decisions. Validate trust and contract endpoints before production routing.
        </p>
      </header>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-tertiary)]">
                <th className="pr-4 py-2">Metric</th>
                <th className="pr-4 py-2">{data.left.name}</th>
                <th className="py-2">{data.right.name}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-4 text-[var(--text-tertiary)]">{row.label}</td>
                  <td className="py-2 pr-4 text-[var(--text-secondary)]">{String(row.left)}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{String(row.right)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Next Steps</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
          <li>Open each agent page and review setup, limitations, and FAQ sections.</li>
          <li>Run snapshot, contract, and trust endpoint checks for both candidates.</li>
          <li>Select the option with better fit for your protocol, reliability, and operational constraints.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="text-[var(--accent-heart)] hover:underline" href={`/agent/${data.left.slug}`}>Open {data.left.name}</Link>
          <Link className="text-[var(--accent-heart)] hover:underline" href={`/agent/${data.right.slug}`}>Open {data.right.name}</Link>
        </div>
      </section>
    </main>
  );
}

