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
    pagination: {
        hasMore: boolean;
        nextCursor: string | null;
        total: number;
    };
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
export declare class Xpersona {
    private readonly baseUrl;
    private readonly fetchImpl;
    constructor(config?: XpersonaConfig);
    search(input: SearchParams, options?: RequestOptions): Promise<SearchResponse>;
    aiSearch(input: SearchAiParams, options?: RequestOptions): Promise<SearchAiResponse>;
    suggest(query: string, limit?: number, options?: RequestOptions): Promise<Record<string, unknown>>;
    agentSnapshot(slug: string, options?: RequestOptions): Promise<AgentSnapshot>;
    toolDescriptor(options?: RequestOptions): Promise<Record<string, unknown>>;
}
export {};
