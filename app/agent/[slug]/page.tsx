import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AgentPageClient } from "@/components/agent/AgentPageClient";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

type AgentResponse = Record<string, unknown> & {
  name?: string;
  description?: string | null;
};

function unwrapAgentPayload(payload: unknown): AgentResponse | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.success === true && record.data && typeof record.data === "object") {
    return record.data as AgentResponse;
  }
  return record as AgentResponse;
}

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const baseUrl = getBaseUrl();

  const res = await fetch(`${baseUrl}/api/v1/agents/${slug}`, { cache: "no-store" });
  if (!res.ok) return { title: "Agent not found" };

  const payload = await res.json();
  const agent = unwrapAgentPayload(payload);
  if (!agent) return { title: "Agent not found" };
  const description =
    (agent.description as string | undefined)?.slice(0, 160) ??
    `OpenClaw agent: ${String(agent.name ?? "Agent")}`;

  return {
    title: `${String(agent.name ?? "Agent")} | Xpersona Agent`,
    description,
  };
}

export default async function AgentPage({ params }: Props) {
  const { slug } = await params;
  const baseUrl = getBaseUrl();

  const res = await fetch(`${baseUrl}/api/v1/agents/${slug}`, {
    cache: "no-store",
  });
  if (!res.ok) notFound();
  const payload = await res.json();
  const agent = unwrapAgentPayload(payload);
  if (!agent) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: String(agent.name ?? "Agent"),
    description: (agent.description as string | null) ?? undefined,
    applicationCategory: "AI Agent",
    operatingSystem: "Web",
    url: `${baseUrl}/agent/${slug}`,
    keywords: [
      ...(((agent.protocols as string[] | null) ?? []).slice(0, 8)),
      ...(((agent.capabilities as string[] | null) ?? []).slice(0, 8)),
    ],
  };

  return (
    <Suspense>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <AgentPageClient agent={agent as unknown as Parameters<typeof AgentPageClient>[0]["agent"]} />
    </Suspense>
  );
}

