export const CUTIE_OPENCODE_PROVIDER_ID = "cutie-openai-compatible";
const DEFAULT_OPENCODE_SERVER_URL = "http://127.0.0.1:4096";

export type OpenCodeConfigTemplateInput = {
  serverUrl?: string;
  model: string;
  openAiBaseUrl?: string;
};

export type OpenCodeMessagePartLike = {
  type?: string;
  text?: string;
  ignored?: boolean;
};

export function normalizeOpenCodeServerUrl(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_OPENCODE_SERVER_URL;
  const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withProtocol);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_OPENCODE_SERVER_URL;
  }
}

export function parseOpenCodeServerAddress(serverUrl: string): {
  normalizedUrl: string;
  hostname: string;
  port: number;
} {
  const normalizedUrl = normalizeOpenCodeServerUrl(serverUrl);
  const url = new URL(normalizedUrl);
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  return {
    normalizedUrl,
    hostname: url.hostname || "127.0.0.1",
    port,
  };
}

export function isLocalOpenCodeServerUrl(serverUrl: string): boolean {
  try {
    const { hostname } = parseOpenCodeServerAddress(serverUrl);
    const lower = hostname.toLowerCase();
    return lower === "127.0.0.1" || lower === "localhost" || lower === "::1";
  } catch {
    return false;
  }
}

export function buildOpenCodeModelRef(model: string): string {
  const trimmed = String(model || "").trim();
  if (!trimmed) return `${CUTIE_OPENCODE_PROVIDER_ID}/moonshotai/Kimi-K2.5:fastest`;
  return trimmed.startsWith(`${CUTIE_OPENCODE_PROVIDER_ID}/`)
    ? trimmed
    : `${CUTIE_OPENCODE_PROVIDER_ID}/${trimmed}`;
}

export function buildOpenCodeConfigTemplate(input: OpenCodeConfigTemplateInput): Record<string, unknown> {
  const { hostname, port } = parseOpenCodeServerAddress(input.serverUrl || DEFAULT_OPENCODE_SERVER_URL);
  const model = String(input.model || "").trim() || "moonshotai/Kimi-K2.5:fastest";
  const modelRef = buildOpenCodeModelRef(model);
  const baseUrl = String(input.openAiBaseUrl || "").trim();
  const providerModels: Record<string, unknown> = {
    [model]: {
      name: model,
    },
  };

  const provider: Record<string, unknown> = {
    npm: "@ai-sdk/openai-compatible",
    name: "Cutie OpenAI-Compatible",
    models: providerModels,
  };

  if (baseUrl) {
    provider.options = {
      baseURL: baseUrl,
    };
  }

  return {
    $schema: "https://opencode.ai/config.json",
    server: {
      hostname,
      port,
    },
    provider: {
      [CUTIE_OPENCODE_PROVIDER_ID]: provider,
    },
    model: modelRef,
    permission: {
      edit: "ask",
      bash: "ask",
      webfetch: "deny",
      external_directory: "deny",
    },
  };
}

export function extractAssistantTextFromOpenCodeParts(parts: OpenCodeMessagePartLike[] | null | undefined): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part && part.type === "text" && !part.ignored && typeof part.text === "string")
    .map((part) => String(part.text || ""))
    .join("")
    .trim();
}

export function truncateOpenCodeNarration(value: string, limit = 240): string {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(1, limit - 1))}…`;
}
