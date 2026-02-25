const DEFAULT_TIMEOUT_MS = Number(process.env.TRUST_HANDSHAKE_TIMEOUT_MS ?? "6000");
const DEFAULT_TTL_HOURS = Number(process.env.TRUST_HANDSHAKE_TTL_HOURS ?? "168");

const PROTOCOL_TOKENS: Record<string, string[]> = {
  MCP: ["mcp"],
  A2A: ["a2a"],
  ANP: ["anp"],
  OPENCLEW: ["openclaw", "openclaw", "open claw"],
  OPENCLAW: ["openclaw", "openclaw", "open claw"],
};

export type HandshakeResult = {
  status: "PASS" | "WARN" | "FAIL" | "UNKNOWN";
  verifiedAt: Date;
  expiresAt: Date;
  latencyProbeMs: number | null;
  errorRateProbe: number | null;
  protocolChecks: Array<{ protocol: string; status: "PASS" | "WARN" | "FAIL" | "UNKNOWN"; reason: string }>;
  capabilityChecks: Array<{ capability: string; status: "PASS" | "WARN" | "UNKNOWN"; reason: string }>;
  evidenceRef: string | null;
};

export async function runCapabilityHandshake(params: {
  url: string | null | undefined;
  homepage: string | null | undefined;
  protocols: string[] | null | undefined;
  capabilities: string[] | null | undefined;
  readme: string | null | undefined;
  description: string | null | undefined;
}): Promise<HandshakeResult> {
  const startedAt = Date.now();
  const verifiedAt = new Date();
  const expiresAt = new Date(verifiedAt.getTime() + DEFAULT_TTL_HOURS * 60 * 60 * 1000);
  const endpoint = pickProbeEndpoint(params.url, params.homepage);

  const readmeText = `${params.readme ?? ""}\n${params.description ?? ""}`.toLowerCase();
  const protocols = (params.protocols ?? []).map((p) => p.toUpperCase());
  const capabilities = params.capabilities ?? [];

  let latencyProbeMs: number | null = null;
  let errorRateProbe: number | null = null;
  let reachable = false;
  let probeReason = "";

  if (endpoint) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      const response = await fetch(endpoint, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      latencyProbeMs = Date.now() - startedAt;
      reachable = response.ok;
      probeReason = response.ok ? `HTTP ${response.status}` : `HTTP ${response.status}`;
      errorRateProbe = response.ok ? 0 : 1;
    } catch (err) {
      latencyProbeMs = Date.now() - startedAt;
      reachable = false;
      probeReason = err instanceof Error ? err.message : "Probe failed";
      errorRateProbe = 1;
    }
  } else {
    probeReason = "No endpoint available";
    errorRateProbe = null;
  }

  const protocolChecks: HandshakeResult["protocolChecks"] = protocols.map((p) => {
    const tokens = PROTOCOL_TOKENS[p] ?? [p.toLowerCase()];
    const found = tokens.some((t) => readmeText.includes(t));
    if (!readmeText.trim()) {
      return { protocol: p, status: "UNKNOWN" as const, reason: "No docs to verify" };
    }
    return {
      protocol: p,
      status: found ? ("PASS" as const) : ("WARN" as const),
      reason: found ? "Protocol mentioned in docs" : "Protocol not found in docs",
    };
  });

  const capabilityChecks: HandshakeResult["capabilityChecks"] = capabilities.slice(0, 20).map((cap) => {
    if (!readmeText.trim()) {
      return { capability: cap, status: "UNKNOWN" as const, reason: "No docs to verify" };
    }
    const normalized = cap.toLowerCase();
    const found = readmeText.includes(normalized);
    return {
      capability: cap,
      status: found ? ("PASS" as const) : ("WARN" as const),
      reason: found ? "Capability mentioned in docs" : "Capability not found in docs",
    };
  });

  let status: HandshakeResult["status"] = "UNKNOWN";
  if (!endpoint) {
    status = "WARN";
  } else if (!reachable) {
    status = "FAIL";
  } else {
    const hasWarn = protocolChecks.some((c) => c.status === "WARN") || capabilityChecks.some((c) => c.status === "WARN");
    status = hasWarn ? "WARN" : "PASS";
  }

  return {
    status,
    verifiedAt,
    expiresAt,
    latencyProbeMs,
    errorRateProbe,
    protocolChecks,
    capabilityChecks,
    evidenceRef: endpoint ? `${endpoint} (${probeReason})` : probeReason,
  };
}

function pickProbeEndpoint(url: string | null | undefined, homepage: string | null | undefined): string | null {
  const candidates = [url, homepage].map((value) => (value ?? "").trim()).filter(Boolean);
  if (candidates.length === 0) return null;
  return candidates[0] ?? null;
}
