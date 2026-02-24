const WHITESPACE_COLLAPSE_RE = /\s+/g;

const FILLER_TOKENS = new Set([
  "i",
  "im",
  "i'm",
  "me",
  "my",
  "you",
  "your",
  "we",
  "our",
  "want",
  "need",
  "looking",
  "look",
  "find",
  "search",
  "please",
  "can",
  "could",
  "would",
  "should",
  "to",
  "a",
  "an",
  "the",
  "for",
  "with",
  "some",
  "something",
  "that",
  "this",
  "is",
  "am",
  "are",
  "be",
  "help",
  "about",
]);

const TOKEN_ALIAS: Record<string, string> = {
  movie: "video",
  film: "video",
  filmmaking: "video",
  make: "build",
  create: "build",
  chatbot: "assistant",
  ai: "artificial intelligence",
  automate: "automation",
  script: "code",
};

const CONVERSATIONAL_RE = /\b(i|i'm|im|want|need|please|help|can you|could you)\b/i;

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, "");
}

export interface IntentInterpretation {
  originalText: string;
  interpretedText: string;
  removedTokens: string[];
  replacedTokens: Record<string, string>;
  isNaturalLanguage: boolean;
}

/**
 * Rewrites conversational phrasing into compact search intent.
 */
export function interpretIntentQuery(textQuery: string): IntentInterpretation {
  const normalized = textQuery.replace(WHITESPACE_COLLAPSE_RE, " ").trim();
  if (!normalized) {
    return {
      originalText: "",
      interpretedText: "",
      removedTokens: [],
      replacedTokens: {},
      isNaturalLanguage: false,
    };
  }

  const rawTokens = normalized.split(/\s+/);
  const removedTokens: string[] = [];
  const replacedTokens: Record<string, string> = {};
  const keptTokens: string[] = [];

  for (const token of rawTokens) {
    const clean = normalizeToken(token);
    if (!clean) continue;
    if (FILLER_TOKENS.has(clean)) {
      removedTokens.push(clean);
      continue;
    }
    const alias = TOKEN_ALIAS[clean];
    if (alias && alias !== clean) {
      replacedTokens[clean] = alias;
      keptTokens.push(alias);
      continue;
    }
    keptTokens.push(clean);
  }

  const interpretedText =
    keptTokens.length > 0 ? keptTokens.join(" ") : normalized.toLowerCase();
  const isNaturalLanguage =
    CONVERSATIONAL_RE.test(normalized) || removedTokens.length >= 2;

  return {
    originalText: normalized,
    interpretedText,
    removedTokens,
    replacedTokens,
    isNaturalLanguage,
  };
}

