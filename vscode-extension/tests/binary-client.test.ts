import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BinaryBuildEvent, BinaryBuildRecord } from "../src/shared";

const { requestJsonMock } = vi.hoisted(() => ({
  requestJsonMock: vi.fn(),
}));

vi.mock("../src/api-client", () => ({
  requestJson: requestJsonMock,
}));

vi.mock("../src/config", () => ({
  getBaseApiUrl: () => "http://localhost:3000",
  getBinaryStreamGatewayUrl: () => "",
}));

import { createBinaryBuildStream, streamBinaryBuildEvents } from "../src/binary-client";

type Listener = (event: unknown) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  private listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => this.emit("open", {}));
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((item) => item !== listener));
  }

  close(): void {
    this.emit("close", {});
  }

  emit(type: string, event: unknown): void {
    if (type === "open") this.onopen?.(event);
    if (type === "message") this.onmessage?.(event as { data: unknown });
    if (type === "error") this.onerror?.(event);
    if (type === "close") this.onclose?.(event);
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
  }

  receive(data: unknown): void {
    this.emit("message", { data });
  }
}

function createBuildRecord(overrides: Partial<BinaryBuildRecord> = {}): BinaryBuildRecord {
  const id = overrides.id || "bin_ws";
  const build: BinaryBuildRecord = {
    id,
    userId: "user-1",
    historySessionId: null,
    runId: null,
    workflow: "binary_generate",
    artifactKind: "package_bundle",
    status: "running",
    phase: "planning",
    progress: 8,
    intent: "stream binary",
    workspaceFingerprint: "workspace-1",
    targetEnvironment: {
      runtime: "node18",
      platform: "portable",
      packageManager: "npm",
    },
    logs: [],
    stream: {
      enabled: true,
      transport: "websocket",
      streamPath: "/api/v1/binary/builds/stream",
      eventsPath: `/api/v1/binary/builds/${id}/events`,
      controlPath: `/api/v1/binary/builds/${id}/control`,
      wsPath: "/ws/session-1",
      resumeToken: "resume-token-1",
      streamSessionId: "session-1",
      lastEventId: null,
    },
    preview: { plan: null, files: [], recentLogs: [] },
    cancelable: true,
    manifest: null,
    reliability: null,
    liveReliability: null,
    artifactState: null,
    sourceGraph: null,
    astState: null,
    execution: null,
    runtimeState: null,
    checkpointId: null,
    checkpoints: [],
    snapshots: [],
    parentBuildId: null,
    pendingRefinement: null,
    artifact: null,
    publish: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  return build;
}

beforeEach(() => {
  requestJsonMock.mockReset();
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response('data: {"id":"evt_sse","buildId":"bin_ws","timestamp":"2026-03-24T00:00:00.000Z","type":"heartbeat","data":{"progress":9}}\n\n', {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
        },
      })
    )
  );
});

describe("binary client transport", () => {
  it("prefers websocket streams when build metadata says websocket is available", async () => {
    const build = createBuildRecord({
      id: "bin_ws",
      stream: {
        enabled: true,
        transport: "websocket",
        streamPath: "/api/v1/binary/builds/stream",
        eventsPath: "/api/v1/binary/builds/bin_ws/events",
        controlPath: "/api/v1/binary/builds/bin_ws/control",
        wsPath: "/ws/session-1",
        resumeToken: "resume-token-1",
        streamSessionId: "session-1",
        lastEventId: null,
      },
    });

    requestJsonMock.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url.includes("/api/v1/binary/builds/bin_ws")) {
        return { data: build };
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });

    const events: BinaryBuildEvent[] = [];
    const promise = streamBinaryBuildEvents({
      auth: { apiKey: "test-key" },
      buildId: "bin_ws",
      onEvent: async (event) => {
        events.push(event);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = MockWebSocket.instances[0];
    expect(socket.url).toContain("/ws/session-1");
    expect(socket.url).toContain("resumeToken=resume-token-1");
    socket.receive('{"id":"evt_ws","buildId":"bin_ws","timestamp":"2026-03-24T00:00:00.000Z","type":"heartbeat","data":{"progress":11}}');
    socket.close();

    await promise;

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("heartbeat");
    expect(requestJsonMock).toHaveBeenCalledWith("GET", expect.stringContaining("/api/v1/binary/builds/bin_ws"), { apiKey: "test-key" });
  });

  it("falls back to SSE replay when websocket transport is unavailable", async () => {
    vi.stubGlobal("WebSocket", undefined as unknown as typeof WebSocket);
    const build = createBuildRecord({
      id: "bin_sse",
      stream: {
        enabled: true,
        transport: "websocket",
        streamPath: "/api/v1/binary/builds/stream",
        eventsPath: "/api/v1/binary/builds/bin_sse/events",
        controlPath: "/api/v1/binary/builds/bin_sse/control",
        wsPath: "/ws/session-2",
        resumeToken: "resume-token-2",
        streamSessionId: "session-2",
        lastEventId: null,
      },
    });

    requestJsonMock.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url.includes("/api/v1/binary/builds/bin_sse")) {
        return { data: build };
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });

    const events: BinaryBuildEvent[] = [];
    await streamBinaryBuildEvents({
      auth: { apiKey: "test-key" },
      buildId: "bin_sse",
      onEvent: async (event) => {
        events.push(event);
      },
    });

    expect(events[0]?.type).toBe("heartbeat");
    expect(events[0]?.data).toMatchObject({ progress: 9 });
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    expect(String(fetchMock.mock.calls[0]?.[0] || "")).toContain("/api/v1/binary/builds/bin_sse/events");
  });

  it("creates a build and immediately exposes websocket stream metadata", async () => {
    const build = createBuildRecord({
      id: "bin_create",
      stream: {
        enabled: true,
        transport: "websocket",
        streamPath: "/api/v1/binary/builds/stream",
        eventsPath: "/api/v1/binary/builds/bin_create/events",
        controlPath: "/api/v1/binary/builds/bin_create/control",
        wsPath: "/ws/session-create",
        resumeToken: "resume-token-create",
        streamSessionId: "session-create",
        lastEventId: null,
      },
    });

    requestJsonMock.mockImplementation(async (method: string, url: string) => {
      if (method === "POST" && url.endsWith("/api/v1/binary/builds")) {
        return { data: build };
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });

    const events: BinaryBuildEvent[] = [];
    const promise = createBinaryBuildStream({
      auth: { apiKey: "test-key" },
      intent: "stream binary",
      workspaceFingerprint: "workspace-1",
      targetEnvironment: {
        runtime: "node18",
        platform: "portable",
        packageManager: "npm",
      },
      onEvent: async (event) => {
        events.push(event);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = MockWebSocket.instances[0];
    socket.receive('{"id":"evt_ws_2","buildId":"bin_create","timestamp":"2026-03-24T00:00:00.000Z","type":"heartbeat","data":{"progress":12}}');
    socket.close();
    await promise;

    expect(events[0]?.type).toBe("build.created");
    expect(events[1]?.type).toBe("heartbeat");
  });
});
