import React from "react";
import { notFound } from "next/navigation";
import { AgentPageClient } from "@/components/agent/AgentPageClient";
import type { Metadata } from "next";
import {
  getPublicAgentPageData,
  shouldEnableMachineBlocks,
  type PublicAgentPageData,
} from "@/lib/agents/public-agent-page";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 300;

function buildJsonLdGraph(data: PublicAgentPageData) {
  const pageId = `${data.canonicalUrl}#webpage`;
  const appId = `${data.canonicalUrl}#software`;
  const machineDatasetId = `${data.canonicalUrl}#machine-dataset`;
  const invocationWorkId = `${data.canonicalUrl}#invocation-templates`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": appId,
        name: data.name,
        description: data.description,
        applicationCategory: "AI Agent",
        operatingSystem: "Web",
        url: data.canonicalUrl,
        sameAs: data.sourceUrl || undefined,
        keywords: data.keywords,
      },
      {
        "@type": "Organization",
        "@id": "https://xpersona.co/#org",
        name: "Xpersona",
        url: "https://xpersona.co",
      },
      {
        "@type": "WebPage",
        "@id": pageId,
        url: data.canonicalUrl,
        name: `${data.name} | Xpersona Agent`,
        description: data.description,
        dateModified: data.updatedAtIso ?? undefined,
        isPartOf: {
          "@type": "WebSite",
          "@id": "https://xpersona.co/#website",
          name: "Xpersona",
          url: "https://xpersona.co",
        },
        about: { "@id": appId },
        isBasedOn: [data.snapshotUrl, data.contractUrl, data.trustUrl],
      },
      {
        "@type": "Dataset",
        "@id": machineDatasetId,
        name: `${data.name} machine execution dossier`,
        description: "Machine-first execution and trust data for autonomous agent selection.",
        isBasedOn: [data.snapshotUrl, data.contractUrl, data.trustUrl],
        dateModified: data.machineBlocks.generatedAt,
        creator: { "@id": "https://xpersona.co/#org" },
        variableMeasured: [
          "executionContractSummary",
          "trustAndReliability",
          "decisionGuardrails",
          "capabilityMatrix",
        ],
      },
      {
        "@type": "CreativeWork",
        "@id": invocationWorkId,
        name: `${data.name} invocation templates`,
        about: { "@id": appId },
        isBasedOn: [data.contractUrl, data.snapshotUrl],
        dateModified: data.machineBlocks.generatedAt,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://xpersona.co",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Agent",
            item: "https://xpersona.co/agent",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: data.name,
            item: data.canonicalUrl,
          },
        ],
      },
    ],
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicAgentPageData(slug);

  if (!data) {
    return {
      title: "Agent not found",
      robots: { index: false, follow: false },
    };
  }

  const title = `${data.name} | Xpersona Agent`;
  const description = data.description.slice(0, 160);

  return {
    title,
    description,
    alternates: {
      canonical: data.canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: data.canonicalUrl,
      siteName: "Xpersona",
      type: "website",
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

function renderJsonBlock(id: string, payload: unknown) {
  return (
    <script
      id={id}
      type="application/json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}

export default async function AgentPage({ params }: Props) {
  const { slug } = await params;
  const data = await getPublicAgentPageData(slug);

  if (!data) notFound();

  const machineEnabled = shouldEnableMachineBlocks(slug);
  const jsonLd = buildJsonLdGraph(data);

  return (
    <>
      <meta name="xpersona:machine-schema-version" content={data.machineBlocks.schemaVersion} />
      <meta name="xpersona:machine-generated-at" content={data.machineBlocks.generatedAt} />
      <link rel="alternate" type="application/json" href={data.snapshotUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:py-10">
        <article className="space-y-6">
          <header className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">AI Agent Profile</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-primary)]">{data.name}</h1>
            <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{data.description}</p>
          </header>

          {machineEnabled && (
            <>
              <section id="machine-contract" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Execution Contract (AI)</h2>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                  <div><dt className="text-[var(--text-tertiary)]">Status</dt><dd>{data.machineBlocks.executionContractSummary.contractStatus}</dd></div>
                  <div><dt className="text-[var(--text-tertiary)]">Supports MCP</dt><dd>{String(data.machineBlocks.executionContractSummary.supportsMcp)}</dd></div>
                  <div><dt className="text-[var(--text-tertiary)]">Supports A2A</dt><dd>{String(data.machineBlocks.executionContractSummary.supportsA2a)}</dd></div>
                  <div><dt className="text-[var(--text-tertiary)]">Supports Streaming</dt><dd>{String(data.machineBlocks.executionContractSummary.supportsStreaming)}</dd></div>
                  <div><dt className="text-[var(--text-tertiary)]">Auth Modes</dt><dd>{data.machineBlocks.executionContractSummary.authModes.join(", ") || "none"}</dd></div>
                  <div><dt className="text-[var(--text-tertiary)]">Freshness (seconds)</dt><dd>{data.machineBlocks.executionContractSummary.freshnessSeconds ?? "unknown"}</dd></div>
                </dl>
                {renderJsonBlock("machine-contract", data.machineBlocks.executionContractSummary)}
              </section>

              <section id="machine-invocation" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Invocation Templates (AI)</h2>
                <div className="mt-3 space-y-3 text-sm">
                  {data.machineBlocks.invocationGuide.curlExamples.map((cmd) => (
                    <pre key={cmd} className="overflow-x-auto rounded bg-black/40 p-3 text-xs">{cmd}</pre>
                  ))}
                  <pre className="overflow-x-auto rounded bg-black/40 p-3 text-xs">{JSON.stringify(data.machineBlocks.invocationGuide.jsonRequestTemplate, null, 2)}</pre>
                  <pre className="overflow-x-auto rounded bg-black/40 p-3 text-xs">{JSON.stringify(data.machineBlocks.invocationGuide.jsonResponseTemplate, null, 2)}</pre>
                </div>
                {renderJsonBlock("machine-invocation", data.machineBlocks.invocationGuide)}
              </section>

              <section id="machine-trust" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Trust and Reliability (AI)</h2>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                  <div><dt className="text-[var(--text-tertiary)]">Trust Status</dt><dd>{data.machineBlocks.trustAndReliability.status}</dd></div>
                  <div><dt className="text-[var(--text-tertiary)]">Trust Confidence</dt><dd>{data.machineBlocks.trustAndReliability.trustConfidence}</dd></div>
                  <div><dt className="text-[var(--text-tertiary)]">Reputation Score</dt><dd>{data.machineBlocks.trustAndReliability.reputationScore ?? "unknown"}</dd></div>
                  <div><dt className="text-[var(--text-tertiary)]">Success Rate 30d</dt><dd>{data.machineBlocks.trustAndReliability.successRate30d ?? "unknown"}</dd></div>
                  <div><dt className="text-[var(--text-tertiary)]">P95 Latency</dt><dd>{data.machineBlocks.trustAndReliability.p95LatencyMs ?? "unknown"}</dd></div>
                  <div><dt className="text-[var(--text-tertiary)]">Freshness (seconds)</dt><dd>{data.machineBlocks.trustAndReliability.freshnessSeconds ?? "unknown"}</dd></div>
                </dl>
                {renderJsonBlock("machine-trust", data.machineBlocks.trustAndReliability)}
              </section>

              <section id="machine-guardrails" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Decision Guardrails (AI)</h2>
                <p className="mt-2 text-sm text-[var(--text-tertiary)]">Operational confidence: {data.machineBlocks.decisionGuardrails.operationalConfidence}</p>
                <h3 className="mt-4 text-sm font-semibold">Do Not Use If</h3>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {data.machineBlocks.decisionGuardrails.doNotUseIf.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <h3 className="mt-4 text-sm font-semibold">Safe Use When</h3>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {data.machineBlocks.decisionGuardrails.safeUseWhen.map((item) => <li key={item}>{item}</li>)}
                </ul>
                {renderJsonBlock("machine-guardrails", data.machineBlocks.decisionGuardrails)}
              </section>

              <section id="machine-capability-matrix" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Capability Matrix (AI)</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--text-tertiary)]">
                        <th className="pr-4">Type</th>
                        <th className="pr-4">Key</th>
                        <th className="pr-4">Support</th>
                        <th className="pr-4">Source</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.machineBlocks.capabilityMatrix.rows.map((row) => (
                        <tr key={`${row.type}-${row.key}`}>
                          <td className="py-1 pr-4">{row.type}</td>
                          <td className="py-1 pr-4">{row.key}</td>
                          <td className="py-1 pr-4">{row.support}</td>
                          <td className="py-1 pr-4">{row.confidenceSource}</td>
                          <td className="py-1">{row.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderJsonBlock("machine-capability-matrix", data.machineBlocks.capabilityMatrix)}
              </section>
            </>
          )}

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Key Facts</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-tertiary)]">Source</dt>
                  <dd className="text-[var(--text-primary)]">{data.source}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-tertiary)]">Trust Score</dt>
                  <dd className="text-[var(--text-primary)]">{data.trustScore == null ? "unknown" : data.trustScore}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-tertiary)]">Overall Rank</dt>
                  <dd className="text-[var(--text-primary)]">{data.overallRank}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-tertiary)]">Verification</dt>
                  <dd className="text-[var(--text-primary)]">{data.verificationTier}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Primary Links</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.keyLinks.map((link) => (
                  <li key={link.label}>
                    <a className="text-[var(--accent-heart)] hover:underline" href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Protocols</h2>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">{data.protocols.length > 0 ? data.protocols.join(", ") : "No protocols listed."}</p>
            <h2 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">Capabilities</h2>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">{data.capabilities.length > 0 ? data.capabilities.join(", ") : "No capabilities listed."}</p>
          </section>

          {data.readmeExcerpt && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Documentation Excerpt</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{data.readmeExcerpt}</p>
            </section>
          )}

          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Structured Data Summary</h2>
            <ul className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
              {data.structuredSummary.map((item) => (
                <li key={item.label}>
                  <span className="text-[var(--text-tertiary)]">{item.label}:</span> {item.value}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--text-tertiary)]">Machine endpoint: {data.snapshotUrl}</p>
          </section>

          {data.hasCustomPage && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Developer Custom Experience</h2>
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                The custom page remains available below as an interactive enhancement.
              </p>
            </section>
          )}

          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Interactive View</h2>
            <div className="mt-4">
              <AgentPageClient
                agent={data.agentForClient as unknown as Parameters<typeof AgentPageClient>[0]["agent"]}
              />
            </div>
          </section>
        </article>
      </main>
    </>
  );
}
