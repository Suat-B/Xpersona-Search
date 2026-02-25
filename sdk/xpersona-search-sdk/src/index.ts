export type SearchParams = {
  q: string;
  protocols?: string[];
  capabilities?: string[];
  minSafety?: number;
  minRank?: number;
  sort?: "rank" | "safety" | "popularity" | "freshness";
  limit?: number;
};

export type SearchAiParams = {
  q: string;
  protocols?: string[];
  capabilities?: string[];
  minSafety?: number;
  minRank?: number;
  limit?: number;
};

export type RequestOptions = {
  fetchImpl?: typeof fetch;
};

export type XpersonaConfig = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type SearchResponse = {
  results: Array<Record<string, unknown>>;
  pagination: { hasMore: boolean; nextCursor: string | null; total: number };
  facets?: Record<string, unknown>;
  didYouMean?: string | null;
  searchMeta?: Record<string, unknown>;
};

type SearchAiResponse = {
  summary: string;
  topAgents: Array<{
    id: string;
    name: string;
    slug: string;
    why: string;
    trust: number | null;
    protocols?: string[] | null;
    capabilities?: string[] | null;
  }>;
  didYouMean: string | null;
  query: string;
};

type AgentSnapshot = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  capabilities: string[];
  protocols: string[];
  safetyScore: number | null;
  overallRank: number | null;
  trustScore: number | null;
  trust: Record<string, unknown> | null;
  source: string | null;
  updatedAt: string | null;
};

function listToCsv(items?: string[]): string | undefined {
  if (!items || items.length === 0) return undefined;
  return items.join(",");
}

function setIfDefined(params: URLSearchParams, key: string, value: string | number | undefined) {
  if (value === undefined || value === null || value === "") return;
  params.set(key, String(value));
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | { error?: { code?: string; message?: string } };
  if (!response.ok) {
    const errBody = body as { error?: { code?: string; message?: string } };
    const code = errBody.error?.code ?? `HTTP_${response.status}`;
    const message = errBody.error?.message ?? "Request failed";
    throw new Error(`${code}: ${message}`);
  }
  return body as T;
}

export class Xpersona {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: XpersonaConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "https://xpersona.co").replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async search(input: SearchParams, options: RequestOptions = {}): Promise<SearchResponse> {
    const params = new URLSearchParams();
    setIfDefined(params, "q", input.q);
    setIfDefined(params, "protocols", listToCsv(input.protocols));
    setIfDefined(params, "capabilities", listToCsv(input.capabilities));
    setIfDefined(params, "minSafety", input.minSafety);
    setIfDefined(params, "minRank", input.minRank);
    setIfDefined(params, "sort", input.sort);
    setIfDefined(params, "limit", input.limit);

    const fetcher = options.fetchImpl ?? this.fetchImpl;
    const response = await fetcher(`${this.baseUrl}/api/v1/search?${params.toString()}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    return parseJson<SearchResponse>(response);
  }

  async aiSearch(input: SearchAiParams, options: RequestOptions = {}): Promise<SearchAiResponse> {
    const params = new URLSearchParams();
    setIfDefined(params, "q", input.q);
    setIfDefined(params, "protocols", listToCsv(input.protocols));
    setIfDefined(params, "capabilities", listToCsv(input.capabilities));
    setIfDefined(params, "minSafety", input.minSafety);
    setIfDefined(params, "minRank", input.minRank);
    setIfDefined(params, "limit", input.limit);

    const fetcher = options.fetchImpl ?? this.fetchImpl;
    const response = await fetcher(`${this.baseUrl}/api/v1/search/ai?${params.toString()}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    return parseJson<SearchAiResponse>(response);
  }

  async suggest(query: string, limit = 8, options: RequestOptions = {}): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const fetcher = options.fetchImpl ?? this.fetchImpl;
    const response = await fetcher(`${this.baseUrl}/api/v1/search/suggest?${params.toString()}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    return parseJson<Record<string, unknown>>(response);
  }

  async agentSnapshot(slug: string, options: RequestOptions = {}): Promise<AgentSnapshot> {
    const fetcher = options.fetchImpl ?? this.fetchImpl;
    const response = await fetcher(`${this.baseUrl}/api/v1/agents/${encodeURIComponent(slug)}/snapshot`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    return parseJson<AgentSnapshot>(response);
  }

  async toolDescriptor(options: RequestOptions = {}): Promise<Record<string, unknown>> {
    const fetcher = options.fetchImpl ?? this.fetchImpl;
    const response = await fetcher(`${this.baseUrl}/api/v1/search/tool`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    return parseJson<Record<string, unknown>>(response);
  }
}
