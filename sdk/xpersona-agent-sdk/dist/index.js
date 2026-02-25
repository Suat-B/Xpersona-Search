function buildIdempotencyKey(prefix) {
    const base = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return prefix ? `${prefix}-${base}` : base;
}
export class XpersonaClient {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.baseUrl = (config.baseUrl ?? "https://xpersona.co").replace(/\/+$/, "");
        this.fetchImpl = config.fetchImpl ?? fetch;
    }
    async postSearchOutcome(payload, options = {}) {
        const response = await this.fetchImpl(`${this.baseUrl}/api/v1/search/outcome`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
                ...(options.idempotencyKey
                    ? { "Idempotency-Key": options.idempotencyKey }
                    : {}),
            },
            body: JSON.stringify(payload),
        });
        const json = (await response.json());
        if (!response.ok || json.success === false) {
            const message = json && "error" in json
                ? `${json.error.code}: ${json.error.message}`
                : `Request failed with status ${response.status}`;
            throw new Error(message);
        }
        return json;
    }
    async reportSearchOutcome(payload, options = {}) {
        const idempotencyKey = options.idempotencyKey ?? buildIdempotencyKey(options.idempotencyPrefix ?? "outcome");
        return this.postSearchOutcome(payload, {
            idempotencyKey,
            fetchImpl: options.fetchImpl,
        });
    }
}
