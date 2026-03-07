import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockResolveActor = vi.hoisted(() => vi.fn());
const mockEnsureTrial = vi.hoisted(() => vi.fn());
const mockCreateBearer = vi.hoisted(() => vi.fn());
const mockProxy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/chat/actor", () => ({
  resolveExistingChatActor: mockResolveActor,
  ensureChatTrialEntitlement: mockEnsureTrial,
  createChatProxyBearer: mockCreateBearer,
}));

vi.mock("@/lib/chat/playground-proxy", () => ({
  proxyPlaygroundRequest: mockProxy,
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

  it("forces chat defaults and proxies via Playground endpoint", async () => {
    const req = new NextRequest("http://localhost/api/me/chat/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "Build me a function",
        historySessionId: "sess-1",
        mode: "yolo",
        model: "Something Else",
        stream: false,
        safetyProfile: "aggressive",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockEnsureTrial).toHaveBeenCalledWith("u1");
    expect(mockCreateBearer).toHaveBeenCalled();
    expect(mockProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/playground/assist",
        acceptSse: true,
        body: expect.objectContaining({
          task: "Build me a function",
          historySessionId: "sess-1",
          mode: "generate",
          model: "Playground 1",
          stream: true,
          safetyProfile: "standard",
        }),
      })
    );
  });
});
