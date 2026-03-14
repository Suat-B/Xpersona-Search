import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchLanding } from "@/components/home/SearchLanding";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";
import {
  capabilityTokenToLabel,
  parseCapabilityParam,
} from "@/lib/search/capability-tokens";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

const PROTOCOL_LABELS: Record<string, string> = {
  MCP: "MCP",
  A2A: "A2A",
  ANP: "ANP",
  OPENCLEW: "OpenClaw",
};

function normalizeList(value?: string | string[]) {
  const raw = Array.isArray(value) ? value.join(",") : value ?? "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const resolvedParams = (await searchParams) ?? {};
  const protocols = normalizeList(resolvedParams.protocols);
  const capabilityTokens = parseCapabilityParam(resolvedParams.capabilities);
  const capabilities = capabilityTokens.map(capabilityTokenToLabel);
  const query = (Array.isArray(resolvedParams.q) ? resolvedParams.q[0] : resolvedParams.q ?? "").trim();

  const protocolLabel = protocols
    .map((p) => PROTOCOL_LABELS[p.toUpperCase()] ?? p.toUpperCase())
    .join(" ");
  const capabilityLabel = capabilities.join(" ");

  let title = "Search AI Agents | Xpersona";
  let description = "Search and discover AI agents by capability, protocol, and trust signals.";

  if (protocols.length > 0 && capabilities.length > 0) {
    title = `Best ${protocolLabel} ${capabilityLabel} Agents – Xpersona`;
    description = `Explore top ${protocolLabel} agents specializing in ${capabilityLabel}.`;
  } else if (capabilities.length > 0) {
    title = `Best ${capabilityLabel} Agents – Xpersona`;
    description = `Discover top AI agents for ${capabilityLabel} workflows.`;
  } else if (protocols.length > 0) {
    title = `Best ${protocolLabel} Agents – Xpersona`;
    description = `Discover top ${protocolLabel} agents with verified trust signals.`;
  } else if (query) {
    title = `Search results for "${query}" – Xpersona`;
    description = `Browse AI agent search results for "${query}".`;
  }

  const canonicalParams = new URLSearchParams();
  if (protocols.length > 0) canonicalParams.set("protocols", protocols.join(","));
  if (capabilityTokens.length > 0) canonicalParams.set("capabilities", capabilityTokens.join(","));
  if (query) canonicalParams.set("q", query);
  const canonical = canonicalParams.toString()
    ? `${baseUrl}/search?${canonicalParams.toString()}`
    : `${baseUrl}/search`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

export default function SearchPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <Suspense
          fallback={
            <div className="min-h-[60vh] flex items-center justify-center text-[var(--text-tertiary)]">
              Loading search...
            </div>
          }
        >
          <SearchLanding basePath="/search" />
        </Suspense>
      </div>
      <ANSMinimalFooter variant="dark" />
    </div>
  );
}
