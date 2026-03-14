const CAPABILITY_ABBREVIATIONS: Record<string, string> = {
  ai: "AI",
  a2a: "A2A",
  api: "API",
  crm: "CRM",
  csv: "CSV",
  etl: "ETL",
  faq: "FAQ",
  html: "HTML",
  json: "JSON",
  llm: "LLM",
  mcp: "MCP",
  ocr: "OCR",
  pdf: "PDF",
  qa: "QA",
  rag: "RAG",
  sdk: "SDK",
  seo: "SEO",
  sql: "SQL",
  ui: "UI",
  ux: "UX",
  xml: "XML",
};

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeCapabilityToken(value: string): string {
  const stripped = stripDiacritics(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return stripped.slice(0, 80);
}

export function normalizeCapabilityTokens(values: Iterable<string>): string[] {
  const deduped = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const token = normalizeCapabilityToken(value);
    if (!token) continue;
    deduped.add(token);
  }
  return [...deduped];
}

export function sanitizeCapabilityLabels(values: Iterable<string>): string[] {
  const deduped = new Map<string, string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const token = normalizeCapabilityToken(trimmed);
    if (!token) continue;
    if (!deduped.has(token)) deduped.set(token, trimmed.slice(0, 120));
  }
  return [...deduped.values()];
}

export function parseCapabilityParam(value?: string | string[] | null): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value ?? "";
  return normalizeCapabilityTokens(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function capabilityTokenToLabel(token: string): string {
  const normalized = normalizeCapabilityToken(token);
  if (!normalized) return token.trim();
  return normalized
    .split("-")
    .map((part) => CAPABILITY_ABBREVIATIONS[part] ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
