export type PlaygroundIndexRetrievalHints = {
  mentionedPaths?: string[];
  candidateSymbols?: string[];
  candidateErrors?: string[];
  preferredTargetPath?: string;
  recentTouchedPaths?: string[];
  queryEmbedding?: number[];
};

export type PlaygroundIndexMetadata = {
  language?: string;
  pathTokens?: string[];
  symbolNames?: string[];
  headings?: string[];
  summary?: string;
  source?: "cloud" | "local_fallback";
  reason?: string;
};

export type PlaygroundIndexBaseRow = {
  id?: string | null;
  pathDisplay?: string | null;
  content: string;
  metadata?: unknown;
  updatedAt?: Date | null;
  embedding?: unknown;
};

export type RankedPlaygroundIndexRow<T extends PlaygroundIndexBaseRow = PlaygroundIndexBaseRow> = T & {
  score: number;
  matchedTerms: string[];
  explanations: string[];
  source: "cloud";
  usedEmbedding: boolean;
};

function normalizeText(value: string): string {
  return String(value || "").toLowerCase();
}

function normalizePath(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .trim()
    .toLowerCase();
}

function tokenize(value: string, maxTerms = 16): string[] {
  const matches =
    String(value || "")
      .toLowerCase()
      .match(/[a-z0-9_./-]{2,}/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    const cleaned = raw.replace(/^[@./]+/, "").replace(/[./-]+$/g, "").trim();
    if (!cleaned || cleaned.length < 2 || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= maxTerms) break;
  }
  return out;
}

function cleanStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = String(item || "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || normalized.length > maxLen || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function compactWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeIndexMetadata(value: unknown): PlaygroundIndexMetadata {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const source =
    raw.source === "cloud" || raw.source === "local_fallback"
      ? raw.source
      : undefined;
  return {
    ...(typeof raw.language === "string" && raw.language.trim()
      ? { language: raw.language.trim().slice(0, 64) }
      : {}),
    pathTokens: cleanStringArray(raw.pathTokens, 48, 120),
    symbolNames: cleanStringArray(raw.symbolNames, 48, 160),
    headings: cleanStringArray(raw.headings, 24, 200),
    ...(typeof raw.summary === "string" && raw.summary.trim()
      ? { summary: compactWhitespace(raw.summary).slice(0, 280) }
      : {}),
    ...(source ? { source } : {}),
    ...(typeof raw.reason === "string" && raw.reason.trim()
      ? { reason: compactWhitespace(raw.reason).slice(0, 240) }
      : {}),
  };
}

function firstNonEmptyLines(content: string, maxLines: number): string[] {
  const out: string[] = [];
  for (const line of String(content || "").replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^```/.test(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= maxLines) break;
  }
  return out;
}

function extractSymbolNames(content: string, maxItems: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\b(?:interface|type|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g,
    /\bdef\s+([A-Za-z_][A-Za-z0-9_]*)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(content)) !== null) {
      const symbol = String(match[1] || "").trim();
      const key = symbol.toLowerCase();
      if (!symbol || seen.has(key)) continue;
      seen.add(key);
      out.push(symbol);
      if (out.length >= maxItems) return out;
    }
  }
  return out;
}

function extractHeadings(content: string, maxItems: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of String(content || "").replace(/\r\n/g, "\n").split("\n")) {
    const heading =
      /^#{1,3}\s+(.+)$/.exec(line)?.[1] ||
      /^\/\/\s*region\s+(.+)$/i.exec(line)?.[1] ||
      /^#\s*region\s+(.+)$/i.exec(line)?.[1];
    const cleaned = compactWhitespace(String(heading || ""));
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned.slice(0, 200));
    if (out.length >= maxItems) break;
  }
  return out;
}

function summarizeContent(content: string): string {
  return firstNonEmptyLines(content, 3).join(" ").slice(0, 280);
}

export function buildIndexChunkMetadata(input: {
  pathDisplay: string;
  content: string;
  language?: string;
  source?: "cloud" | "local_fallback";
  reason?: string;
}): PlaygroundIndexMetadata {
  const normalizedPath = normalizePath(input.pathDisplay);
  return {
    ...(input.language ? { language: input.language } : {}),
    pathTokens: tokenize(normalizedPath.replace(/[/.\\_-]+/g, " "), 32),
    symbolNames: extractSymbolNames(input.content, 24),
    headings: extractHeadings(input.content, 12),
    summary: summarizeContent(input.content),
    ...(input.source ? { source: input.source } : {}),
    ...(input.reason ? { reason: compactWhitespace(input.reason).slice(0, 240) } : {}),
  };
}

function candidateTerms(input: {
  query: string;
  hints?: PlaygroundIndexRetrievalHints;
}): { queryTerms: string[]; errorTerms: string[]; symbolTerms: string[] } {
  return {
    queryTerms: tokenize(input.query, 16),
    errorTerms: tokenize((input.hints?.candidateErrors || []).join(" "), 16),
    symbolTerms: tokenize((input.hints?.candidateSymbols || []).join(" "), 16),
  };
}

function collectRowCorpus(row: PlaygroundIndexBaseRow, metadata: PlaygroundIndexMetadata): string {
  return [
    row.pathDisplay || "",
    row.content || "",
    metadata.summary || "",
    ...(metadata.pathTokens || []),
    ...(metadata.symbolNames || []),
    ...(metadata.headings || []),
  ]
    .join("\n")
    .toLowerCase();
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function coerceEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    const parsed = Number(item);
    if (!Number.isFinite(parsed)) return null;
    out.push(parsed);
  }
  return out.length > 0 ? out : null;
}

export function rankPlaygroundIndexRows<T extends PlaygroundIndexBaseRow>(input: {
  rows: T[];
  query: string;
  limit: number;
  hints?: PlaygroundIndexRetrievalHints;
}): RankedPlaygroundIndexRow<T>[] {
  const limit = Math.max(1, Math.min(input.limit, 50));
  const hints = input.hints || {};
  const { queryTerms, errorTerms, symbolTerms } = candidateTerms({
    query: input.query,
    hints,
  });
  const mentionedPaths = new Set((hints.mentionedPaths || []).map((item) => normalizePath(item)));
  const recentTouched = new Set((hints.recentTouchedPaths || []).map((item) => normalizePath(item)));
  const preferredTarget = normalizePath(hints.preferredTargetPath || "");
  const queryEmbedding = coerceEmbedding(hints.queryEmbedding);

  return input.rows
    .map((row) => {
      const metadata = normalizeIndexMetadata(row.metadata);
      const corpus = collectRowCorpus(row, metadata);
      const pathDisplay = normalizePath(row.pathDisplay || "");
      const explanations: string[] = [];
      let score = 0;

      const matchedTerms = queryTerms.filter((term) => corpus.includes(term));
      if (matchedTerms.length > 0) {
        const lexicalScore = (matchedTerms.length / Math.max(1, queryTerms.length)) * 4.2;
        score += lexicalScore;
        explanations.push(`lexical coverage +${lexicalScore.toFixed(2)} (${matchedTerms.join(", ")})`);
      }

      const pathTermMatches = queryTerms.filter(
        (term) =>
          pathDisplay.includes(term) ||
          (metadata.pathTokens || []).some((token) => token.toLowerCase() === term)
      );
      if (pathTermMatches.length > 0) {
        const pathScore = Math.min(2.4, pathTermMatches.length * 0.8);
        score += pathScore;
        explanations.push(`path match +${pathScore.toFixed(2)}`);
      }

      const exactMentionMatch =
        mentionedPaths.has(pathDisplay) ||
        Array.from(mentionedPaths).some(
          (mentionedPath) =>
            mentionedPath &&
            (pathDisplay.endsWith(`/${mentionedPath}`) || pathDisplay === mentionedPath)
        );
      if (exactMentionMatch) {
        score += 5.4;
        explanations.push("mentioned path boost +5.40");
      }

      if (preferredTarget && pathDisplay === preferredTarget) {
        score += 4.8;
        explanations.push("preferred target boost +4.80");
      } else if (preferredTarget && pathDisplay.endsWith(`/${preferredTarget}`)) {
        score += 3.8;
        explanations.push("target suffix boost +3.80");
      }

      if (recentTouched.has(pathDisplay)) {
        score += 2.8;
        explanations.push("recently touched boost +2.80");
      }

      const symbolMatches = symbolTerms.filter((term) =>
        (metadata.symbolNames || []).some((symbol) => normalizeText(symbol).includes(term)) ||
        (metadata.headings || []).some((heading) => normalizeText(heading).includes(term))
      );
      if (symbolMatches.length > 0) {
        const symbolScore = Math.min(3.2, symbolMatches.length * 1.1);
        score += symbolScore;
        explanations.push(`symbol match +${symbolScore.toFixed(2)} (${symbolMatches.join(", ")})`);
      }

      const diagnosticMatches = errorTerms.filter((term) => corpus.includes(term));
      if (diagnosticMatches.length > 0) {
        const diagnosticScore = Math.min(1.8, diagnosticMatches.length * 0.45);
        score += diagnosticScore;
        explanations.push(`diagnostic overlap +${diagnosticScore.toFixed(2)}`);
      }

      const ageMs =
        row.updatedAt instanceof Date && Number.isFinite(row.updatedAt.getTime())
          ? Date.now() - row.updatedAt.getTime()
          : Number.POSITIVE_INFINITY;
      if (Number.isFinite(ageMs) && ageMs >= 0) {
        const ageHours = ageMs / (1000 * 60 * 60);
        const recencyScore = Math.max(0, 0.85 - Math.min(0.85, ageHours / 96));
        if (recencyScore > 0) {
          score += recencyScore;
          explanations.push(`recency +${recencyScore.toFixed(2)}`);
        }
      }

      let usedEmbedding = false;
      const rowEmbedding = coerceEmbedding(row.embedding);
      if (queryEmbedding && rowEmbedding) {
        const cosine = cosineSimilarity(queryEmbedding, rowEmbedding);
        if (cosine > 0) {
          const embeddingScore = cosine * 1.5;
          score += embeddingScore;
          usedEmbedding = true;
          explanations.push(`embedding boost +${embeddingScore.toFixed(2)}`);
        }
      }

      if (metadata.reason) explanations.push(metadata.reason);
      if (metadata.source === "local_fallback") explanations.push("local fallback snippet");

      return {
        ...row,
        score: Number(score.toFixed(4)),
        matchedTerms,
        explanations: explanations.slice(0, 8),
        source: "cloud" as const,
        usedEmbedding,
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aUpdated = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
      const bUpdated = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
      return bUpdated - aUpdated;
    })
    .slice(0, limit);
}
