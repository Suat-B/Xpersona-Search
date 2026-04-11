const DEFAULT_API_KEY_HEADER = "X-API-Key";
const URL_SCHEMES = new Set(["http:", "https:"]);
function compactWhitespace(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}
function normalizeHeaders(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    const entries = Object.entries(value)
        .map(([key, raw]) => [compactWhitespace(key), String(raw ?? "").trim()])
        .filter(([key, raw]) => key && raw);
    return entries.length ? Object.fromEntries(entries) : undefined;
}
export function validateConnectionDraft(input) {
    const name = compactWhitespace(input.name);
    if (!name) {
        return { ok: false, message: "Connection name is required." };
    }
    const transport = input.transport === "http" || input.transport === "sse" ? input.transport : null;
    if (!transport) {
        return { ok: false, message: "Connection transport must be http or sse." };
    }
    const urlText = String(input.url ?? "").trim();
    let parsedUrl;
    try {
        parsedUrl = new URL(urlText);
    }
    catch {
        return { ok: false, message: "Connection URL must be a valid http or https URL." };
    }
    if (!URL_SCHEMES.has(parsedUrl.protocol)) {
        return { ok: false, message: "Only http and https connection URLs are supported in v1." };
    }
    const authMode = input.authMode === "none" ||
        input.authMode === "bearer" ||
        input.authMode === "api-key" ||
        input.authMode === "oauth"
        ? input.authMode
        : "none";
    const headerName = authMode === "api-key"
        ? compactWhitespace(input.headerName) || DEFAULT_API_KEY_HEADER
        : undefined;
    const publicHeaders = normalizeHeaders(input.publicHeaders);
    return {
        ok: true,
        draft: {
            ...(typeof input.id === "string" && input.id.trim() ? { id: input.id.trim() } : {}),
            name,
            transport,
            url: parsedUrl.toString(),
            authMode,
            enabled: input.enabled === false ? false : true,
            source: input.source === "starter" || input.source === "guided" || input.source === "imported"
                ? input.source
                : "guided",
            ...(headerName ? { headerName } : {}),
            ...(publicHeaders ? { publicHeaders } : {}),
            ...(input.oauthSupported === true ? { oauthSupported: true } : {}),
            ...(typeof input.importedFrom === "string" && input.importedFrom.trim()
                ? { importedFrom: input.importedFrom.trim() }
                : {}),
        },
    };
}
export function connectionHasRequiredSecret(record, secret) {
    if (record.authMode === "none")
        return true;
    if (record.authMode === "oauth") {
        return Boolean(secret?.accessToken?.trim() || secret?.refreshToken?.trim() || secret?.sessionToken?.trim());
    }
    if (record.authMode === "bearer")
        return Boolean(secret?.bearerToken?.trim());
    if (record.authMode === "api-key")
        return Boolean(secret?.apiKey?.trim());
    return false;
}
export function getConnectionStatus(record, secret) {
    if (!record.enabled)
        return "disabled";
    if (!connectionHasRequiredSecret(record, secret))
        return "needs_auth";
    if (record.lastValidationOk === false || Boolean(record.lastValidationError))
        return "failed_test";
    return "connected";
}
export function buildConnectionView(record, secret) {
    return {
        ...record,
        status: getConnectionStatus(record, secret),
        hasSecret: connectionHasRequiredSecret(record, secret),
    };
}
export function materializeConnectionForOpenHands(record, secret) {
    if (!record.enabled)
        return null;
    if (!connectionHasRequiredSecret(record, secret))
        return null;
    const headers = {
        ...(record.publicHeaders || {}),
        ...(secret?.secretHeaders || {}),
    };
    if (record.authMode === "bearer" && secret?.bearerToken?.trim()) {
        headers.Authorization = `Bearer ${secret.bearerToken.trim()}`;
    }
    if (record.authMode === "api-key" && secret?.apiKey?.trim()) {
        headers[record.headerName || DEFAULT_API_KEY_HEADER] = secret.apiKey.trim();
    }
    const base = {
        url: record.url,
        transport: record.transport,
    };
    if (record.authMode === "oauth") {
        return {
            ...base,
            auth: "oauth",
        };
    }
    if (Object.keys(headers).length) {
        return {
            ...base,
            headers,
            ...(record.authMode === "api-key" && secret?.apiKey?.trim() ? { api_key: secret.apiKey.trim() } : {}),
        };
    }
    return base;
}
export function buildOpenHandsMcpConfig(records, secrets) {
    const entries = records
        .map((record) => [record.name, materializeConnectionForOpenHands(record, secrets[record.id])])
        .filter((entry) => Boolean(entry[1]));
    if (!entries.length)
        return undefined;
    return {
        mcpServers: Object.fromEntries(entries),
    };
}
export function importConnectionsFromMcpJson(raw, importedFrom) {
    let parsed;
    try {
        parsed = JSON.parse(String(raw || ""));
    }
    catch {
        return { ok: false, message: "The provided .mcp.json is not valid JSON." };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, message: "The provided .mcp.json must contain an object root." };
    }
    const servers = parsed.mcpServers;
    if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
        return { ok: false, message: "The provided .mcp.json must contain an mcpServers object." };
    }
    const definitions = [];
    for (const [name, rawServer] of Object.entries(servers)) {
        if (typeof rawServer === "string") {
            const draft = validateConnectionDraft({
                name,
                transport: "http",
                url: rawServer,
                authMode: "none",
                enabled: true,
                source: "imported",
                importedFrom,
            });
            if (!draft.ok)
                return draft;
            definitions.push({
                record: draft.draft,
                secret: {},
            });
            continue;
        }
        if (!rawServer || typeof rawServer !== "object" || Array.isArray(rawServer)) {
            return { ok: false, message: `Connection "${name}" must be a URL or object.` };
        }
        const server = rawServer;
        if (typeof server.command === "string" || Array.isArray(server.args)) {
            return {
                ok: false,
                message: `Connection "${name}" uses stdio. Local stdio MCP servers are not supported in v1.`,
            };
        }
        const rawHeaders = normalizeHeaders(server.headers);
        const authMode = server.auth === "oauth"
            ? "oauth"
            : rawHeaders?.Authorization
                ? "bearer"
                : rawHeaders?.["X-API-Key"] || rawHeaders?.["x-api-key"]
                    ? "api-key"
                    : "none";
        const secret = {};
        const publicHeaders = { ...(rawHeaders || {}) };
        if (typeof publicHeaders.Authorization === "string") {
            const authHeader = publicHeaders.Authorization.trim();
            if (/^Bearer\s+/i.test(authHeader)) {
                secret.bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
                delete publicHeaders.Authorization;
            }
        }
        const apiKeyHeader = Object.keys(publicHeaders).find((key) => key.toLowerCase() === "x-api-key");
        if (apiKeyHeader && typeof publicHeaders[apiKeyHeader] === "string") {
            secret.apiKey = publicHeaders[apiKeyHeader].trim();
            delete publicHeaders[apiKeyHeader];
        }
        const draft = validateConnectionDraft({
            name,
            transport: server.transport === "sse"
                ? "sse"
                : server.transport === "http" || server.transport === "streamable_http"
                    ? "http"
                    : "http",
            url: server.url,
            authMode,
            enabled: server.enabled === false ? false : true,
            source: "imported",
            publicHeaders,
            headerName: apiKeyHeader || DEFAULT_API_KEY_HEADER,
            oauthSupported: server.auth === "oauth",
            importedFrom,
        });
        if (!draft.ok)
            return draft;
        definitions.push({
            record: draft.draft,
            secret,
        });
    }
    return { ok: true, definitions };
}
