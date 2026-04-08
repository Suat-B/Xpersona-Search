import { describe, expect, it } from "vitest";
import { buildConnectionView, buildOpenHandsMcpConfig, importConnectionsFromMcpJson, validateConnectionDraft, } from "./connections.js";
function createRecord(overrides = {}) {
    return {
        id: "conn_1",
        name: "Docs",
        transport: "http",
        url: "https://example.com/mcp",
        authMode: "none",
        enabled: true,
        source: "guided",
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
        ...overrides,
    };
}
describe("connections helpers", () => {
    it("validates remote http connections", () => {
        const validated = validateConnectionDraft({
            name: "Browse websites",
            transport: "sse",
            url: "https://example.com/sse",
            authMode: "none",
            enabled: true,
            source: "starter",
        });
        expect(validated.ok).toBe(true);
        if (validated.ok) {
            expect(validated.draft.transport).toBe("sse");
            expect(validated.draft.url).toBe("https://example.com/sse");
        }
    });
    it("materializes only eligible connections for OpenHands", () => {
        const config = buildOpenHandsMcpConfig([
            createRecord({ id: "one", name: "One", authMode: "bearer" }),
            createRecord({ id: "two", name: "Two", enabled: false }),
        ], {
            one: { bearerToken: "secret-token" },
            two: {},
        });
        expect(config).toEqual({
            mcpServers: {
                One: {
                    url: "https://example.com/mcp",
                    transport: "http",
                    headers: {
                        Authorization: "Bearer secret-token",
                    },
                },
            },
        });
    });
    it("marks enabled unauthenticated connections as needs_auth", () => {
        const view = buildConnectionView(createRecord({ authMode: "api-key" }), {});
        expect(view.status).toBe("needs_auth");
        expect(view.hasSecret).toBe(false);
    });
    it("treats oauth session tokens as valid local auth", () => {
        const view = buildConnectionView(createRecord({ authMode: "oauth" }), {
            sessionToken: "session-token",
        });
        expect(view.status).toBe("connected");
        expect(view.hasSecret).toBe(true);
    });
    it("rejects stdio servers during import", () => {
        const imported = importConnectionsFromMcpJson(JSON.stringify({
            mcpServers: {
                local: {
                    command: "python",
                    args: ["-m", "fetch_server"],
                },
            },
        }));
        expect(imported.ok).toBe(false);
        if (!imported.ok) {
            expect(imported.message).toContain("stdio");
        }
    });
    it("imports remote servers and extracts secrets", () => {
        const imported = importConnectionsFromMcpJson(JSON.stringify({
            mcpServers: {
                tavily: {
                    transport: "http",
                    url: "https://example.com/mcp",
                    headers: {
                        Authorization: "Bearer abc123",
                        "X-Client": "binary",
                    },
                },
            },
        }), "sample.mcp.json");
        expect(imported.ok).toBe(true);
        if (imported.ok) {
            expect(imported.definitions[0]?.record.name).toBe("tavily");
            expect(imported.definitions[0]?.secret.bearerToken).toBe("abc123");
            expect(imported.definitions[0]?.record.publicHeaders).toEqual({
                "X-Client": "binary",
            });
        }
    });
});
