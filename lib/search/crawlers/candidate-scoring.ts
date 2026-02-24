export interface CandidateSignalInput {
  name?: string | null;
  description?: string | null;
  topics?: string[] | null;
  originSource?: string;
}

const POSITIVE_SIGNALS = [
  "mcp",
  "model context protocol",
  "openclaw",
  "skill",
  "agent",
  "a2a",
  "tool-calling",
  "crewai",
  "autogen",
] as const;

const NEGATIVE_SIGNALS = [
  "awesome-list",
  "archived",
  "template-only",
] as const;

export function scoreCandidate(input: CandidateSignalInput): {
  confidence: number;
  reasons: string[];
} {
  const hay = `${input.name ?? ""} ${input.description ?? ""} ${(input.topics ?? []).join(" ")}`
    .toLowerCase();
  const reasons: string[] = [];
  let score = 20;

  for (const s of POSITIVE_SIGNALS) {
    if (hay.includes(s)) {
      score += s === "mcp" || s === "openclaw" ? 20 : 10;
      reasons.push(`signal:${s}`);
    }
  }

  for (const s of NEGATIVE_SIGNALS) {
    if (hay.includes(s)) {
      score -= 20;
      reasons.push(`negative:${s}`);
    }
  }

  if ((input.originSource ?? "").toUpperCase().includes("CURATED")) {
    score += 20;
    reasons.push("origin:curated");
  }

  if ((input.originSource ?? "").toUpperCase().includes("MCP_REGISTRY")) {
    score += 25;
    reasons.push("origin:mcp_registry");
  }

  score = Math.max(0, Math.min(100, score));
  return { confidence: score, reasons };
}

