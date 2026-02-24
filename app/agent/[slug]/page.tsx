import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AgentPageClient } from "@/components/agent/AgentPageClient";
import { ConciergeWidget } from "@/components/concierge/ConciergeWidget";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
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

  const agent = await res.json();
  const description =
    (agent.description as string)?.slice(0, 160) ??
    `OpenClaw agent: ${agent.name}`;

  return {
    title: `${agent.name} | Xpersona Agent`,
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
  const agent = await res.json();

  return (
    <Suspense>
      <AgentPageClient agent={agent} />
      <ConciergeWidget />
    </Suspense>
  );
}

