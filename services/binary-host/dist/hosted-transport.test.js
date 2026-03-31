import { afterEach, describe, expect, it } from "vitest";
import { continueHostedRun, streamHostedAssist } from "./hosted-transport.js";
function createAssistRequest() {
    return {
        task: "Ship a tiny project",
        mode: "auto",
        model: "Binary IDE",
    };
}
function createAbortAwareHungFetch() {
    return (_url, init) => new Promise((_, reject) => {
        const signal = init?.signal;
        if (!signal)
            return;
        if (signal.aborted) {
            reject(signal.reason ?? new Error("aborted"));
            return;
        }
        signal.addEventListener("abort", () => {
            reject(signal.reason ?? new Error("aborted"));
        }, { once: true });
    });
}
function createSseResponse(chunks) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    }), {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
        },
    });
}
afterEach(() => {
    delete process.env.BINARY_HOST_HOSTED_CONTINUE_FETCH_TIMEOUT_MS;
});
describe("hosted-transport", () => {
    it("times out when the initial assist fetch hangs", async () => {
        await expect(streamHostedAssist({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            request: createAssistRequest(),
            onEvent: () => { },
        }, {
            fetchImpl: createAbortAwareHungFetch(),
            fetchTimeoutMs: 25,
            streamIdleTimeoutMs: 25,
        })).rejects.toThrow("Timed out waiting for hosted assist after 25ms.");
    });
    it("times out when the assist stream never produces a chunk", async () => {
        const fetchImpl = async () => new Response(new ReadableStream({
            start() { },
        }), {
            status: 200,
            headers: {
                "Content-Type": "text/event-stream",
            },
        });
        await expect(streamHostedAssist({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            request: createAssistRequest(),
            onEvent: () => { },
        }, {
            fetchImpl: fetchImpl,
            fetchTimeoutMs: 25,
            streamIdleTimeoutMs: 25,
        })).rejects.toThrow("Timed out waiting for hosted assist stream activity after 25ms.");
    });
    it("parses streamed assist events into an envelope", async () => {
        const seenEvents = [];
        const fetchImpl = async () => createSseResponse([
            'data: {"event":"run","data":{"runId":"run-123","adapter":"binary"}}\n\n',
            'data: {"event":"meta","data":{"sessionId":"session-1","loopState":{"stepCount":4}}}\n\n',
            'data: {"event":"tool_request","data":{"step":5,"adapter":"binary","requiresClientExecution":true,"toolCall":{"id":"tool-1","name":"read_file","arguments":{"path":"README.md"}},"createdAt":"2026-03-31T05:00:00.000Z"}}\n\n',
            'data: {"event":"final","data":"complete"}\n\n',
            "data: [DONE]\n\n",
        ]);
        const envelope = await streamHostedAssist({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            request: createAssistRequest(),
            onEvent: (event) => {
                seenEvents.push(event);
            },
        }, {
            fetchImpl: fetchImpl,
            fetchTimeoutMs: 50,
            streamIdleTimeoutMs: 50,
        });
        expect(envelope.runId).toBe("run-123");
        expect(envelope.adapter).toBe("binary");
        expect(envelope.sessionId).toBe("session-1");
        expect(envelope.loopState?.stepCount).toBe(4);
        expect(envelope.pendingToolCall?.toolCall.name).toBe("read_file");
        expect(envelope.final).toBe("complete");
        expect(seenEvents).toHaveLength(4);
    });
    it("forwards TOM config to hosted assist", async () => {
        const fetchImpl = async (_url, init) => {
            const body = JSON.parse(String(init?.body || "{}"));
            expect(body.tom).toEqual({ enabled: false });
            return createSseResponse(["data: [DONE]\n\n"]);
        };
        await streamHostedAssist({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            request: {
                ...createAssistRequest(),
                tom: { enabled: false },
            },
            onEvent: () => { },
        }, {
            fetchImpl: fetchImpl,
            fetchTimeoutMs: 50,
            streamIdleTimeoutMs: 50,
        });
    });
    it("times out when the continue call hangs", async () => {
        await expect(continueHostedRun({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            runId: "run-123",
            toolResult: {
                toolCallId: "tool-1",
                name: "read_file",
                ok: true,
                summary: "read ok",
            },
        }, {
            fetchImpl: createAbortAwareHungFetch(),
            fetchTimeoutMs: 25,
        })).rejects.toThrow("Timed out waiting for hosted continue after 25ms.");
    });
    it("uses the dedicated continue timeout env var when no override is provided", async () => {
        process.env.BINARY_HOST_HOSTED_CONTINUE_FETCH_TIMEOUT_MS = "25";
        await expect(continueHostedRun({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            runId: "run-123",
            toolResult: {
                toolCallId: "tool-1",
                name: "read_file",
                ok: true,
                summary: "read ok",
            },
        }, {
            fetchImpl: createAbortAwareHungFetch(),
        })).rejects.toThrow("Timed out waiting for hosted continue after 25ms.");
    });
});
