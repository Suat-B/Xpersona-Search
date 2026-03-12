import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockResolveActor = vi.hoisted(() => vi.fn());
const mockEnsureTrial = vi.hoisted(() => vi.fn());
const mockCreateBearer = vi.hoisted(() => vi.fn());
const mockProxy = vi.hoisted(() => vi.fn());
const mockBuildWorkspaceContext = vi.hoisted(() => vi.fn());

vi.mock("@/lib/chat/actor", () => ({
  resolveExistingChatActor: mockResolveActor,
  ensureChatTrialEntitlement: mockEnsureTrial,
  createChatProxyBearer: mockCreateBearer,
}));

vi.mock("@/lib/chat/playground-proxy", () => ({
  proxyPlaygroundRequest: mockProxy,
}));

vi.mock("@/lib/chat/workspace-context", () => ({
  buildWorkspaceAssistContext: mockBuildWorkspaceContext,
}));

describe("POST /api/me/chat/assist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveActor.mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      isAnonymous: true,
      accountType: "agent",
      source: "existing",
    });
    mockEnsureTrial.mockResolvedValue({
      planTier: "trial",
      status: "trial",
      trialEndsAt: new Date().toISOString(),
    });
    mockCreateBearer.mockReturnValue("xp_vsat_mock");
    mockProxy.mockResolvedValue(new Response("ok", { status: 200 }));
    mockBuildWorkspaceContext.mockResolvedValue({
      activeFile: {
        path: "components/chat/ChatApp.tsx",
        language: "tsx",
        content: "export function ChatApp() {}",
      },
      openFiles: [
        {
          path: "app/api/me/chat/assist/route.ts",
          language: "ts",
          excerpt: "export async function POST() {}",
        },
      ],
      indexedSnippets: [
        {
          path: "lib/chat/workspace-context.ts",
          score: 0.89,
          content: "function buildWorkspaceAssistContext(task: string)",
        },
      ],
    });
  });

  it("returns 401 when actor is missing", async () => {
    mockResolveActor.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/me/chat/assist", {
      method: "POST",
      body: JSON.stringify({ task: "hello" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when task is missing", async () => {
    const req = new NextRequest("http://localhost/api/me/chat/assist", {
      method: "POST",
      body: JSON.stringify({ task: "   " }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("forces minimal chat defaults and proxies via Playground assist", async () => {
    const req = new NextRequest("http://localhost/api/me/chat/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "Build me a function",
        historySessionId: "sess-1",
        mode: "yolo",
        model: "Something Else",
        stream: false,
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockEnsureTrial).toHaveBeenCalledWith("u1");
    expect(mockCreateBearer).toHaveBeenCalled();
    expect(mockBuildWorkspaceContext).not.toHaveBeenCalled();
    expect(mockProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/playground/assist",
        acceptSse: true,
        body: expect.objectContaining({
          task: expect.stringContaining('User request: "Build me a function".'),
          historySessionId: "sess-1",
          mode: "auto",
          stream: true,
          model: "playground-default",
        }),
      })
    );
  });

  it("uses workspace mode only for repo-scoped coding tasks", async () => {
    const req = new NextRequest("http://localhost/api/me/chat/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "Update components/chat/ChatApp.tsx to improve the composer state",
      }),
      headers: { "Content-Type": "application/json" },
    });

    await POST(req);
    expect(mockBuildWorkspaceContext).toHaveBeenCalledWith(
      "Update components/chat/ChatApp.tsx to improve the composer state"
    );
    expect(mockProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          task: expect.stringContaining('User request: "Update components/chat/ChatApp.tsx to improve the composer state".'),
          context: expect.objectContaining({
            activeFile: expect.objectContaining({ path: "components/chat/ChatApp.tsx" }),
          }),
          retrievalHints: {
            preferredTargetPath: "components/chat/ChatApp.tsx",
          },
          mode: "yolo",
          stream: true,
          model: "playground-default",
        }),
      })
    );
  });

  it("keeps non-code tasks in auto mode", async () => {
    const req = new NextRequest("http://localhost/api/me/chat/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "How does this platform work?",
      }),
      headers: { "Content-Type": "application/json" },
    });

    await POST(req);
    expect(mockBuildWorkspaceContext).not.toHaveBeenCalled();
    expect(mockProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          task: expect.stringContaining('User message: "How does this platform work?".'),
          mode: "auto",
          model: "playground-default",
          stream: true,
        }),
      })
    );
  });

  it("does not auto-infer workspace context for plain chat prompts", async () => {
    const req = new NextRequest("http://localhost/api/me/chat/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "what are u doing",
      }),
      headers: { "Content-Type": "application/json" },
    });

    await POST(req);
    expect(mockBuildWorkspaceContext).not.toHaveBeenCalled();
    expect(mockProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.not.objectContaining({
          context: expect.anything(),
        }),
      })
    );
  });

  it("skips automatic workspace inference when context is already supplied", async () => {
    const req = new NextRequest("http://localhost/api/me/chat/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "Use this provided context",
        context: {
          activeFile: {
            path: "custom.ts",
            content: "const x = 1;",
          },
        },
      }),
      headers: { "Content-Type": "application/json" },
    });

    await POST(req);
    expect(mockBuildWorkspaceContext).not.toHaveBeenCalled();
    expect(mockProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          context: expect.objectContaining({
            activeFile: expect.objectContaining({ path: "custom.ts" }),
          }),
        }),
      })
    );
  });
});
