import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaygroundClient, toHostedAssistMode } from "./client.js";
describe("toHostedAssistMode", () => {
    it("maps generate and debug to yolo", () => {
        expect(toHostedAssistMode("generate")).toBe("yolo");
        expect(toHostedAssistMode("debug")).toBe("yolo");
        expect(toHostedAssistMode("auto")).toBe("auto");
        expect(toHostedAssistMode("plan")).toBe("plan");
        expect(toHostedAssistMode("yolo")).toBe("yolo");
    });
});
describe("PlaygroundClient.continueRun", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });
    it("truncates oversized tool payloads before posting them", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { final: "ok" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
        }));
        vi.stubGlobal("fetch", fetchMock);
        const client = new PlaygroundClient({
            baseUrl: "https://example.test/",
            auth: { apiKey: "secret" },
        });
        await client.continueRun("run-1", {
            toolCallId: "call-1",
            name: "run_command",
            ok: false,
            summary: "s".repeat(25_000),
            error: "e".repeat(5_000),
            data: {
                stdout: "o".repeat(9_000),
                stderr: "x".repeat(9_000),
                content: "c".repeat(17_000),
            },
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://example.test/api/v1/playground/runs/run-1/continue");
        expect(init.method).toBe("POST");
        expect(init.headers.Authorization).toBe("Bearer secret");
        const body = JSON.parse(String(init.body));
        expect(body.toolResult.summary.length).toBeLessThanOrEqual(20_000);
        expect(body.toolResult.summary).toContain("[truncated]");
        expect(body.toolResult.error.length).toBeLessThanOrEqual(4_000);
        expect(body.toolResult.data.stdout.length).toBeLessThanOrEqual(8_000);
        expect(body.toolResult.data.stderr.length).toBeLessThanOrEqual(8_000);
        expect(body.toolResult.data.content.length).toBeLessThanOrEqual(16_000);
    });
    it("surfaces HTTP failures from continueRun", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "BAD", message: "tool rejected" } }), {
            status: 400,
            headers: { "content-type": "application/json" },
        })));
        const client = new PlaygroundClient({
            baseUrl: "https://example.test",
            auth: {},
        });
        await expect(client.continueRun("run-2", {
            toolCallId: "call-2",
            name: "edit",
            ok: false,
            summary: "failed",
        })).rejects.toMatchObject({
            name: "CliHttpError",
            status: 400,
            message: "BAD: tool rejected",
        });
    });
});
describe("PlaygroundClient assist TOM forwarding", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });
    it("includes TOM config in non-stream assists", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { final: "ok" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
        }));
        vi.stubGlobal("fetch", fetchMock);
        const client = new PlaygroundClient({
            baseUrl: "https://example.test",
            auth: { apiKey: "secret" },
        });
        await client.assist({
            task: "Ship it",
            mode: "auto",
            tom: { enabled: false },
        });
        const [, init] = fetchMock.mock.calls[0];
        const body = JSON.parse(String(init.body));
        expect(body.tom).toEqual({ enabled: false });
    });
    it("includes MCP config in non-stream assists", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { final: "ok" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
        }));
        vi.stubGlobal("fetch", fetchMock);
        const client = new PlaygroundClient({
            baseUrl: "https://example.test",
            auth: { apiKey: "secret" },
        });
        await client.assist({
            task: "Ship it",
            mode: "auto",
            mcp: {
                mcpServers: {
                    Docs: {
                        url: "https://example.com/mcp",
                        transport: "http",
                    },
                },
            },
        });
        const [, init] = fetchMock.mock.calls[0];
        const body = JSON.parse(String(init.body));
        expect(body.mcp?.mcpServers?.Docs).toEqual({
            url: "https://example.com/mcp",
            transport: "http",
        });
    });
});
