import { afterEach, describe, expect, it } from "vitest";
import { continueHostedRun, streamHostedAssist, submitHostedUserInput } from "./hosted-transport.js";
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
    it("captures streamed user-input requests in the envelope", async () => {
        const fetchImpl = async () => createSseResponse([
            'data: {"event":"run","data":{"runId":"run-plan-1","adapter":"binary"}}\n\n',
            'data: {"event":"request_user_input","data":{"requestId":"req-plan-1","questions":[{"id":"scope","header":"Scope","question":"Which surface should we prioritize?","options":[{"label":"Desktop compat","description":"Keep the work scoped to the Electron compat shell."},{"label":"Desktop and web","description":"Update both surfaces together."}]}]}}\n\n',
            "data: [DONE]\n\n",
        ]);
        const envelope = await streamHostedAssist({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            request: createAssistRequest(),
            onEvent: () => { },
        }, {
            fetchImpl: fetchImpl,
            fetchTimeoutMs: 50,
            streamIdleTimeoutMs: 50,
        });
        expect(envelope.runId).toBe("run-plan-1");
        expect(envelope.userInputRequest).toEqual({
            requestId: "req-plan-1",
            questions: [
                {
                    id: "scope",
                    header: "Scope",
                    question: "Which surface should we prioritize?",
                    options: [
                        {
                            label: "Desktop compat",
                            description: "Keep the work scoped to the Electron compat shell.",
                        },
                        {
                            label: "Desktop and web",
                            description: "Update both surfaces together.",
                        },
                    ],
                },
            ],
        });
    });
    it("forwards delegation config and folds delegation events into the envelope", async () => {
        const fetchImpl = async (_url, init) => {
            const body = JSON.parse(String(init?.body || "{}"));
            expect(body.delegation).toEqual({
                enabled: true,
                mode: "auto",
                maxChildren: 3,
                visibility: "summary_only",
                supportedAgentTypes: ["default"],
            });
            return createSseResponse([
                'data: {"event":"delegation.started","data":{"delegationReason":"Parallel repo scan","childCount":2,"childSummaries":[{"childId":"child-1","status":"running","summary":"Scanning app shell."}]}}\n\n',
                'data: {"event":"delegation.child_status","data":{"childId":"child-2","status":"completed","summary":"Checked host transport.","traceId":"trace-child-2"}}\n\n',
                'data: {"event":"delegation.completed","data":{"completedChildren":2,"failedChildren":0,"childSummaries":[{"childId":"child-1","status":"completed","summary":"Scanning app shell complete."},{"childId":"child-2","status":"completed","summary":"Checked host transport.","traceId":"trace-child-2"}]}}\n\n',
                "data: [DONE]\n\n",
            ]);
        };
        const envelope = await streamHostedAssist({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            request: {
                ...createAssistRequest(),
                delegation: {
                    enabled: true,
                    mode: "auto",
                    maxChildren: 3,
                    visibility: "summary_only",
                    supportedAgentTypes: ["default"],
                },
            },
            onEvent: () => { },
        }, {
            fetchImpl: fetchImpl,
            fetchTimeoutMs: 50,
            streamIdleTimeoutMs: 50,
        });
        expect(envelope.delegationUsed).toBe(true);
        expect(envelope.delegationReason).toBe("Parallel repo scan");
        expect(envelope.childCount).toBe(2);
        expect(envelope.completedChildren).toBe(2);
        expect(envelope.failedChildren).toBe(0);
        expect(envelope.childSummaries).toEqual([
            {
                childId: "child-1",
                status: "completed",
                summary: "Scanning app shell complete.",
            },
            {
                childId: "child-2",
                status: "completed",
                summary: "Checked host transport.",
                traceId: "trace-child-2",
            },
        ]);
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
    it("forwards MCP config to hosted assist", async () => {
        const fetchImpl = async (_url, init) => {
            const body = JSON.parse(String(init?.body || "{}"));
            expect(body.mcp?.mcpServers?.Docs).toEqual({
                url: "https://example.com/mcp",
                transport: "http",
            });
            return createSseResponse(["data: [DONE]\n\n"]);
        };
        await streamHostedAssist({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            request: {
                ...createAssistRequest(),
                mcp: {
                    mcpServers: {
                        Docs: {
                            url: "https://example.com/mcp",
                            transport: "http",
                        },
                    },
                },
            },
            onEvent: () => { },
        }, {
            fetchImpl: fetchImpl,
            fetchTimeoutMs: 50,
            streamIdleTimeoutMs: 50,
        });
    });
    it("forwards connected provider candidates to hosted assist", async () => {
        const fetchImpl = async (_url, init) => {
            const body = JSON.parse(String(init?.body || "{}"));
            expect(body.chatModelSource).toBe("user_connected");
            expect(body.fallbackToPlatformModel).toBe(true);
            expect(body.userConnectedModels?.[0]?.alias).toBe("user:openai");
            expect(body.userConnectedModels?.[0]?.provider).toBe("openai");
            return createSseResponse(["data: [DONE]\n\n"]);
        };
        await streamHostedAssist({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            request: {
                ...createAssistRequest(),
                chatModelSource: "user_connected",
                fallbackToPlatformModel: true,
                userConnectedModels: [
                    {
                        alias: "user:openai",
                        provider: "openai",
                        displayName: "OpenAI",
                        model: "gpt-5.4",
                        baseUrl: "https://api.openai.com/v1",
                        apiKey: "sk-test",
                        authSource: "user_connected",
                        candidateSource: "user_connected",
                    },
                ],
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
    it("submits hosted user-input answers to the dedicated resume endpoint", async () => {
        const fetchImpl = async (url, init) => {
            expect(url).toContain("/api/v1/playground/runs/run-clarify-1/user-input");
            const body = JSON.parse(String(init?.body || "{}"));
            expect(body).toEqual({
                requestId: "req-clarify-1",
                sessionId: "session-1",
                answers: {
                    scope: ["Desktop compat only"],
                },
            });
            return new Response(JSON.stringify({
                data: {
                    runId: "run-clarify-1",
                    final: "Plan is ready.",
                },
            }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            });
        };
        const envelope = await submitHostedUserInput({
            baseUrl: "http://localhost:3000",
            apiKey: "test-key",
            runId: "run-clarify-1",
            requestId: "req-clarify-1",
            sessionId: "session-1",
            answers: {
                scope: ["Desktop compat only"],
            },
        }, {
            fetchImpl: fetchImpl,
            fetchTimeoutMs: 50,
        });
        expect(envelope.runId).toBe("run-clarify-1");
        expect(envelope.final).toBe("Plan is ready.");
    });
});
