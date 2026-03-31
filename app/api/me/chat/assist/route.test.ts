import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockResolveExistingChatActor = vi.hoisted(() => vi.fn());
const mockEnsureChatTrialEntitlement = vi.hoisted(() => vi.fn());
const mockCreateChatProxyBearer = vi.hoisted(() => vi.fn());
const mockProxyPlaygroundRequest = vi.hoisted(() => vi.fn());
const mockBuildWorkspaceAssistContext = vi.hoisted(() => vi.fn());
const mockGetUserPlaygroundProfile = vi.hoisted(() => vi.fn());
const mockGetPlaygroundByomPreferences = vi.hoisted(() => vi.fn());
const mockListUserConnectedModels = vi.hoisted(() => vi.fn());

vi.mock("@/lib/chat/actor", () => ({
  resolveExistingChatActor: mockResolveExistingChatActor,
  ensureChatTrialEntitlement: mockEnsureChatTrialEntitlement,
  createChatProxyBearer: mockCreateChatProxyBearer,
}));

vi.mock("@/lib/chat/playground-proxy", () => ({
  proxyPlaygroundRequest: mockProxyPlaygroundRequest,
}));

vi.mock("@/lib/chat/workspace-context", () => ({
  buildWorkspaceAssistContext: mockBuildWorkspaceAssistContext,
}));

vi.mock("@/lib/playground/store", () => ({
  getUserPlaygroundProfile: mockGetUserPlaygroundProfile,
}));

vi.mock("@/lib/playground/byom", () => ({
  getPlaygroundByomPreferences: mockGetPlaygroundByomPreferences,
  listUserConnectedModels: mockListUserConnectedModels,
}));

describe("POST /api/me/chat/assist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveExistingChatActor.mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
    });
    mockEnsureChatTrialEntitlement.mockResolvedValue({});
    mockCreateChatProxyBearer.mockReturnValue("bearer-token");
    mockProxyPlaygroundRequest.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    mockBuildWorkspaceAssistContext.mockResolvedValue({ activeFile: { path: "src/app.ts" } });
    mockGetUserPlaygroundProfile.mockResolvedValue({
      preferredModelAlias: "user:openai",
      stablePreferences: {},
    });
    mockGetPlaygroundByomPreferences.mockReturnValue({
      preferredChatModelSource: "user_connected",
      fallbackToPlatformModel: true,
    });
    mockListUserConnectedModels.mockResolvedValue([
      {
        alias: "user:openai",
        displayName: "Your OpenAI model",
      },
    ]);
  });

  it("routes chat-style turns through the connected user model", async () => {
    const req = new NextRequest("http://localhost/api/me/chat/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "Can you help me think through a product announcement?",
      }),
    });
    await POST(req);
    expect(mockProxyPlaygroundRequest).toHaveBeenCalledTimes(1);
    const proxiedBody = mockProxyPlaygroundRequest.mock.calls[0][0].body as Record<string, unknown>;
    expect(proxiedBody.interactionKind).toBe("chat");
    expect(proxiedBody.chatModelSource).toBe("user_connected");
    expect(proxiedBody.model).toBe("user:openai");
  });

  it("keeps repo-scoped code tasks on the platform model", async () => {
    const req = new NextRequest("http://localhost/api/me/chat/assist", {
      method: "POST",
      body: JSON.stringify({
        task: "Fix our current repo build in src/app.ts",
      }),
    });
    await POST(req);
    const proxiedBody = mockProxyPlaygroundRequest.mock.calls[0][0].body as Record<string, unknown>;
    expect(proxiedBody.interactionKind).toBe("repo_code");
    expect(proxiedBody.chatModelSource).toBe("platform");
    expect(proxiedBody.model).toBe("kimi-k2");
  });
});
