function listToCsv(items) {
    if (!items || items.length === 0)
        return undefined;
    return items.join(",");
}
function setIfDefined(params, key, value) {
    if (value === undefined || value === null || value === "")
        return;
    params.set(key, String(value));
}
async function parseJson(response) {
    const body = (await response.json());
    if (!response.ok) {
        const errBody = body;
        const code = errBody.error?.code ?? `HTTP_${response.status}`;
        const message = errBody.error?.message ?? "Request failed";
        throw new Error(`${code}: ${message}`);
    }
    return body;
}
export class Xpersona {
    constructor(config = {}) {
        this.baseUrl = (config.baseUrl ?? "https://xpersona.co").replace(/\/+$/, "");
        this.fetchImpl = config.fetchImpl ?? fetch;
    }
    async search(input, options = {}) {
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
        return parseJson(response);
    }
    async aiSearch(input, options = {}) {
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
        return parseJson(response);
    }
    async suggest(query, limit = 8, options = {}) {
        const params = new URLSearchParams({ q: query, limit: String(limit) });
        const fetcher = options.fetchImpl ?? this.fetchImpl;
        const response = await fetcher(`${this.baseUrl}/api/v1/search/suggest?${params.toString()}`, {
            method: "GET",
            headers: { accept: "application/json" },
        });
        return parseJson(response);
    }
    async agentSnapshot(slug, options = {}) {
        const fetcher = options.fetchImpl ?? this.fetchImpl;
        const response = await fetcher(`${this.baseUrl}/api/v1/agents/${encodeURIComponent(slug)}/snapshot`, {
            method: "GET",
            headers: { accept: "application/json" },
        });
        return parseJson(response);
    }
    async toolDescriptor(options = {}) {
        const fetcher = options.fetchImpl ?? this.fetchImpl;
        const response = await fetcher(`${this.baseUrl}/api/v1/search/tool`, {
            method: "GET",
            headers: { accept: "application/json" },
        });
        return parseJson(response);
    }
}
