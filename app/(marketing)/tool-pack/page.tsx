import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/docs/CopyButton";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Xpersona Tool Pack",
  description: "Drop-in tool JSON for OpenAI, Anthropic, LangChain, CrewAI, and AutoGen.",
  alternates: {
    canonical: `${baseUrl}/tool-pack`,
  },
  openGraph: {
    title: "Xpersona Tool Pack",
    description: "Drop-in tool JSON for OpenAI, Anthropic, LangChain, CrewAI, and AutoGen.",
    url: `${baseUrl}/tool-pack`,
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

function buildOpenAiTools() {
  return [
    {
      type: "function",
      function: {
        name: "xpersona_search_ai",
        description: "GET /api/v1/search/ai — low-token agent discovery for autonomous systems.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Natural language query." },
            protocols: {
              type: "array",
              items: { type: "string", enum: ["A2A", "MCP", "ANP", "OPENCLAW"] },
              description: "Optional protocol filters.",
            },
            capabilities: {
              type: "array",
              items: { type: "string" },
              description: "Optional capability filters.",
            },
            minSafety: { type: "number", minimum: 0, maximum: 100 },
            minRank: { type: "number", minimum: 0, maximum: 100 },
            limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
          },
          required: ["q"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "xpersona_agent_snapshot",
        description: "GET /api/v1/agents/{slug}/snapshot — stable agent summary for extraction and caching.",
        parameters: {
          type: "object",
          properties: {
            slug: { type: "string", description: "Agent slug." },
          },
          required: ["slug"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "xpersona_agent_contract",
        description: "GET /api/v1/agents/{slug}/contract — capability and integration contract data.",
        parameters: {
          type: "object",
          properties: {
            slug: { type: "string", description: "Agent slug." },
          },
          required: ["slug"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "xpersona_agent_trust",
        description: "GET /api/v1/agents/{slug}/trust — trust, verification, and reliability signals.",
        parameters: {
          type: "object",
          properties: {
            slug: { type: "string", description: "Agent slug." },
          },
          required: ["slug"],
          additionalProperties: false,
        },
      },
    },
  ];
}

function buildAnthropicTools() {
  return [
    {
      name: "xpersona_search_ai",
      description: "GET /api/v1/search/ai — low-token agent discovery for autonomous systems.",
      input_schema: {
        type: "object",
        properties: {
          q: { type: "string", description: "Natural language query." },
          protocols: {
            type: "array",
            items: { type: "string", enum: ["A2A", "MCP", "ANP", "OPENCLAW"] },
            description: "Optional protocol filters.",
          },
          capabilities: {
            type: "array",
            items: { type: "string" },
            description: "Optional capability filters.",
          },
          minSafety: { type: "number", minimum: 0, maximum: 100 },
          minRank: { type: "number", minimum: 0, maximum: 100 },
          limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
        },
        required: ["q"],
        additionalProperties: false,
      },
    },
    {
      name: "xpersona_agent_snapshot",
      description: "GET /api/v1/agents/{slug}/snapshot — stable agent summary for extraction and caching.",
      input_schema: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Agent slug." },
        },
        required: ["slug"],
        additionalProperties: false,
      },
    },
    {
      name: "xpersona_agent_contract",
      description: "GET /api/v1/agents/{slug}/contract — capability and integration contract data.",
      input_schema: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Agent slug." },
        },
        required: ["slug"],
        additionalProperties: false,
      },
    },
    {
      name: "xpersona_agent_trust",
      description: "GET /api/v1/agents/{slug}/trust — trust, verification, and reliability signals.",
      input_schema: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Agent slug." },
        },
        required: ["slug"],
        additionalProperties: false,
      },
    },
  ];
}

export default function ToolPackPage() {
  const openaiTools = buildOpenAiTools();
  const anthropicTools = buildAnthropicTools();
  const langchainTools = openaiTools;
  const crewAiTools = openaiTools;
  const autogenTools = openaiTools;

  const openaiJson = JSON.stringify(openaiTools, null, 2);
  const anthropicJson = JSON.stringify(anthropicTools, null, 2);
  const langchainJson = JSON.stringify(langchainTools, null, 2);
  const crewaiJson = JSON.stringify(crewAiTools, null, 2);
  const autogenJson = JSON.stringify(autogenTools, null, 2);
  const toolEndpoints = [
    { label: "OpenAI", href: "/api/v1/tools/openai" },
    { label: "Anthropic", href: "/api/v1/tools/anthropic" },
    { label: "LangChain", href: "/api/v1/tools/langchain" },
  ];
  const frameworks = [
    {
      id: "openai",
      title: "OpenAI",
      description: "Paste into the tools array.",
      json: openaiJson,
    },
    {
      id: "anthropic",
      title: "Anthropic",
      description: "Paste into the tools array.",
      json: anthropicJson,
    },
    {
      id: "langchain",
      title: "LangChain",
      description: "OpenAI-compatible tools for LangChain agents.",
      json: langchainJson,
    },
    {
      id: "crewai",
      title: "CrewAI",
      description: "OpenAI-compatible tools for CrewAI agents.",
      json: crewaiJson,
    },
    {
      id: "autogen",
      title: "AutoGen",
      description: "OpenAI-compatible tools for AutoGen agents.",
      json: autogenJson,
    },
  ];

  return (
    <main className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="agent-card p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,42,108,0.18),_transparent_55%)]" aria-hidden />
          <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-[var(--accent-neural)]/20 blur-3xl" aria-hidden />
          <div className="relative">
            <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Tool Pack</p>
            <h1 className="mt-2 text-3xl font-bold">Drop-in tool JSON</h1>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Copy once, paste anywhere. These schemas map to /api/v1/search/ai, /snapshot, /contract, and /trust.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
              {toolEndpoints.map((endpoint) => (
                <Link key={endpoint.href} className="text-[var(--accent-heart)] hover:underline" href={endpoint.href}>
                  {endpoint.href}
                </Link>
              ))}
            </div>
          </div>
        </header>

        <section className="agent-card p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Step 1</p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Paste the tool pack</p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">Pick your framework JSON below and drop it into tools.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Step 2</p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Call AI search</p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">Use /api/v1/search/ai for low-token discovery.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Step 3</p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Verify trust + contract</p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">Snapshot, contract, and trust are the required checks.</p>
            </div>
          </div>
        </section>

        <section className="agent-card p-5">
          <h2 className="text-lg font-semibold">Live endpoints</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {toolEndpoints.map((endpoint) => (
              <div key={endpoint.href} className="rounded-xl border border-white/[0.08] bg-black/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{endpoint.label}</p>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">GET</span>
                </div>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">{endpoint.href}</p>
                <div className="relative mt-3 rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto">
                  <CopyButton text={`${baseUrl}${endpoint.href}`} />
                  <pre className="text-emerald-300/90 whitespace-pre">{`${baseUrl}${endpoint.href}`}</pre>
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-white/[0.08] bg-black/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--text-primary)]">AI Search</p>
                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">GET</span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">/api/v1/search/ai</p>
              <div className="relative mt-3 rounded-lg bg-black/50 p-3 font-mono text-[11px] overflow-x-auto">
                <CopyButton text={`${baseUrl}/api/v1/search/ai?q=agent+planner&limit=3`} />
                <pre className="text-emerald-300/90 whitespace-pre">{`${baseUrl}/api/v1/search/ai?q=agent+planner&limit=3`}</pre>
              </div>
            </div>
          </div>
        </section>

        <section className="agent-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Tool pack JSON</h2>
            <p className="text-xs text-[var(--text-secondary)]">Open a framework, copy, and go.</p>
          </div>
          <div className="grid gap-3">
            {frameworks.map((framework, index) => (
              <details
                key={framework.id}
                className="group rounded-xl border border-white/[0.08] bg-black/40 px-4 py-3"
                open={index === 0}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--text-primary)]">
                  <span>{framework.title}</span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                    {framework.id === "anthropic" ? "Input Schema" : "Function Tools"}
                  </span>
                </summary>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">{framework.description}</p>
                <div className="relative mt-3 rounded-lg bg-black/50 p-4 font-mono text-[11px] overflow-x-auto">
                  <CopyButton text={framework.json} />
                  <pre className="text-emerald-300/90 whitespace-pre">{framework.json}</pre>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
