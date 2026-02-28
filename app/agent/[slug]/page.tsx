import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentPageClient } from "@/components/agent/AgentPageClient";
import { AgentMiniCard } from "@/components/agent/AgentMiniCard";
import {
  getPublicAgentPageData,
  shouldEnableMachineBlocks,
  type PublicAgentPageData,
} from "@/lib/agents/public-agent-page";
import {
  isThinContent,
  resolveEditorialContent,
} from "@/lib/agents/editorial-content";
import { getAgentsByProtocol, sourceSlugFromValue } from "@/lib/agents/hub-data";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 300;

type EditorialData = Awaited<ReturnType<typeof resolveEditorialContent>>;

async function getEditorial(data: PublicAgentPageData): Promise<EditorialData> {
  const clientData = (data.agentForClient ?? {}) as Record<string, unknown>;
  const openclawData =
    (clientData.openclawData as Record<string, unknown> | null | undefined) ?? null;

  return resolveEditorialContent({
    agentId: data.id,
    name: data.name,
    description: data.description,
    capabilities: data.capabilities,
    protocols: data.protocols,
    source: data.source,
    readmeExcerpt: data.readmeExcerpt,
    updatedAtIso: data.updatedAtIso,
    openclawData,
    sourceUrl: data.sourceUrl,
    homepage: data.homepage,
  });
}

function buildJsonLdGraph(data: PublicAgentPageData, editorial: EditorialData) {
  const pageId = `${data.canonicalUrl} #webpage`;
  const appId = `${data.canonicalUrl} #software`;
  const machineDatasetId = `${data.canonicalUrl} #machine - dataset`;
  const invocationWorkId = `${data.canonicalUrl} #invocation - templates`;
  const faqId = `${data.canonicalUrl} #faq`;

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
        mainEntity: { "@id": faqId },
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
        "@type": "FAQPage",
        "@id": faqId,
        mainEntity: editorial.sections.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
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

  const editorial = await getEditorial(data);
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
      index: !isThinContent(editorial.quality),
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

  const editorial = await getEditorial(data);
  const machineEnabled = shouldEnableMachineBlocks(slug);
  const jsonLd = buildJsonLdGraph(data, editorial);
  const relatedByProtocol =
    data.protocols.length > 0
      ? (await getAgentsByProtocol(data.protocols[0], 8))
        .filter((item) => item.slug !== data.slug)
        .slice(0, 4)
      : [];

  return (
    <>
      <meta name="xpersona:machine-schema-version" content={data.machineBlocks.schemaVersion} />
      <meta name="xpersona:machine-generated-at" content={data.machineBlocks.generatedAt} />
      <link rel="alternate" type="application/json" href={data.snapshotUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:py-10">
        <article className="space-y-6">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Agent Experience</h2>
            <div className="mt-4">
              <AgentPageClient
                agent={data.agentForClient as unknown as Parameters<typeof AgentPageClient>[0]["agent"]}
              />
            </div>
          </section>

          <header className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">AI Agent Profile</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-primary)]">{data.name}</h1>
            <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{data.description}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[var(--text-tertiary)]">
                Content quality: {editorial.quality.score}/100
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[var(--text-tertiary)]">
                Setup: {editorial.setupComplexity}
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[var(--text-tertiary)]">
                Last reviewed: {new Date(editorial.lastReviewedAt).toLocaleDateString("en-US")}
              </span>
            </div>
          </header>

          <section id="overview" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">What This Agent Does</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              {editorial.sections.overview}
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Best For</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {editorial.sections.bestFor}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Not Ideal For</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {editorial.sections.notFor}
              </p>
            </div>
          </section>

          <section id="setup" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Setup & Provisioning Guide</h2>
            <ul className="mt-3 space-y-3 text-sm text-[var(--text-secondary)]">
              {editorial.sections.setup.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)]">
                    {i + 1}
                  </span>
                  <p className="pt-0.5 leading-relaxed">{step}</p>
                </li>
              ))}
            </ul>
          </section>

          {data.protocols.some(p => p.toUpperCase() === "MCP") && (
            <section id="integration" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Developer Integration (MCP)</h2>
              <p className="mt-2 mb-3 text-sm text-[var(--text-secondary)]">Connect to this agent programmatically using the official Model Context Protocol (MCP) SDKs.</p>

              <div className="space-y-4">
                <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                  <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)]">TypeScript (Node.js)</div>
                  <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed text-[var(--text-primary)]"><code>{`import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "${data.name}"]
});

const client = new Client({
  name: "xpersona-client",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

await client.connect(transport);
console.log("Connected to ${data.name} via MCP!");`}</code></pre>
                </div>

                <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                  <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)]">Python</div>
                  <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed text-[var(--text-primary)]"><code>{`import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

server_params = StdioServerParameters(
    command="npx",
    args=["-y", "${data.name}"]
)

async def main():
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("Connected to ${data.name} via MCP!")

asyncio.run(main())`}</code></pre>
                </div>
              </div>
            </section>
          )}

          <section id="workflows" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Real Workflows</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
              {editorial.sections.workflows.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>

          {editorial.sections.extractedFiles && editorial.sections.extractedFiles.length > 0 && (
            <section id="source-code" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Extracted Source & Configuration</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Key configuration and source files extracted automatically from the agent's latest release archive.
              </p>
              <div className="mt-4 space-y-4">
                {editorial.sections.extractedFiles.map((file) => (
                  <div key={file.path} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
                    <div className="border-b border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)]">
                      {file.path}
                    </div>
                    <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-[var(--text-secondary)]">
                      <code>{file.content}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Limitations And Failure Modes</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {editorial.sections.limitations}
              </p>
            </div>
            <div id="alternatives" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Alternatives</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {editorial.sections.alternatives}
              </p>
              {relatedByProtocol.length > 0 && (
                <div className="mt-4 grid gap-3 md:grid-cols-1">
                  {relatedByProtocol.map((item) => (
                    <AgentMiniCard key={item.id} agent={item} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {editorial.sections.releaseHighlights.length > 0 && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Release And Freshness Highlights</h2>
              <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                {editorial.sections.releaseHighlights.slice(0, 6).map((item) => (
                  <li key={`${item.version} -${item.createdAt ?? "n/a"} `}>
                    <span className="font-medium text-[var(--text-primary)]">v{item.version}</span>
                    {item.createdAt ? ` - ${new Date(item.createdAt).toLocaleDateString("en-US")} ` : ""}
                    {item.fileCount != null ? ` - ${item.fileCount} files` : ""}
                    {item.changelog ? ` - ${item.changelog} ` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section id="faq" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">FAQ</h2>
            <div className="mt-3 space-y-3">
              {editorial.sections.faq.map((item) => (
                <details key={item.q} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <summary className="cursor-pointer font-medium text-[var(--text-primary)]">{item.q}</summary>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Data Sources And Page Health</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
              {editorial.dataSources.map((source, index) => (
                <li key={`${source}-${index}`}>
                  <a className="text-[var(--accent-heart)] hover:underline" href={source} target="_blank" rel="noopener noreferrer">
                    {source}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-tertiary)]">
              <span>Word count: {editorial.quality.wordCount}</span>
              <span>| Uniqueness: {editorial.quality.uniquenessScore}/100</span>
              <span>| Quality status: {editorial.quality.status}</span>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Explore Related Pages</h2>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link href="/agent" className="text-[var(--accent-heart)] hover:underline">Agent hub</Link>
              <Link
                href={`/ agent / source / ${encodeURIComponent(sourceSlugFromValue(data.source))} `}
                className="text-[var(--accent-heart)] hover:underline"
              >
                More from {data.source}
              </Link>
              {data.protocols.map((protocol) => (
                <Link
                  key={protocol}
                  href={`/ agent / protocol / ${encodeURIComponent(protocol.toLowerCase())} `}
                  className="text-[var(--accent-heart)] hover:underline"
                >
                  {protocol} agents
                </Link>
              ))}
              {editorial.useCases.map((useCase) => (
                <Link
                  key={useCase}
                  href={`/ agent / use -case/${encodeURIComponent(useCase)}`}
                  className="text-[var(--accent-heart)] hover:underline"
                >
                  {useCase.replace(/-/g, " ")}
                </Link >
              ))}
            </div >
          </section >

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

          {
            data.readmeExcerpt && (
              <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Documentation Excerpt</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{data.readmeExcerpt}</p>
              </section>
            )
          }

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

        </article >
      </main >
    </>
  );
}
