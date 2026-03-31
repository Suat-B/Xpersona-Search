import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockResolveActor = vi.hoisted(() => vi.fn());
const mockCreateAnonymous = vi.hoisted(() => vi.fn());
const mockEnsureTrial = vi.hoisted(() => vi.fn());
const mockApplyCookie = vi.hoisted(() => vi.fn());
const mockRateLimit = vi.hoisted(() => vi.fn());
const mockGetUserPlaygroundProfile = vi.hoisted(() => vi.fn());
const mockListUserConnectedModels = vi.hoisted(() => vi.fn());
const mockGetBrowserAuthAvailability = vi.hoisted(() => vi.fn());
const mockGetPlaygroundByomPreferences = vi.hoisted(() => vi.fn());

vi.mock("@/lib/chat/actor", () => ({
  resolveExistingChatActor: mockResolveActor,
  createAnonymousChatActor: mockCreateAnonymous,
  ensureChatTrialEntitlement: mockEnsureTrial,
  applyChatActorCookie: mockApplyCookie,
}));

vi.mock("@/lib/chat/bootstrap-rate-limit", () => ({
  checkChatBootstrapRateLimit: mockRateLimit,
}));

vi.mock("@/lib/playground/store", () => ({
  getUserPlaygroundProfile: mockGetUserPlaygroundProfile,
}));

vi.mock("@/lib/playground/byom", () => ({
  listUserConnectedModels: mockListUserConnectedModels,
  getBrowserAuthAvailability: mockGetBrowserAuthAvailability,
  getPlaygroundByomPreferences: mockGetPlaygroundByomPreferences,
}));

describe("POST /api/me/chat/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureTrial.mockResolvedValue({
      planTier: "trial",
      status: "trial",
      trialEndsAt: new Date().toISOString(),
    });
    mockGetUserPlaygroundProfile.mockResolvedValue(null);
    mockListUserConnectedModels.mockResolvedValue([]);
    mockGetBrowserAuthAvailability.mockReturnValue({ enabled: false, reason: "disabled" });
    mockGetPlaygroundByomPreferences.mockReturnValue({
      preferredChatModelSource: "platform",
      fallbackToPlatformModel: true,
    });
    mockRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
  });

  it("reuses existing actor when available", async () => {
    mockResolveActor.mockResolvedValueOnce({
      userId: "u1",
      email: "u@example.com",
      isAnonymous: false,
      accountType: "email",
      source: "existing",
    });
    const req = new NextRequest("http://localhost/api/me/chat/bootstrap", { method: "POST" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.viewer.userId).toBe("u1");
    expect(mockEnsureTrial).toHaveBeenCalledWith("u1");
    expect(mockCreateAnonymous).not.toHaveBeenCalled();
  });

  it("returns 429 when anonymous bootstrap is rate-limited", async () => {
    mockResolveActor.mockResolvedValueOnce(null);
    mockRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfter: 33 });
    const req = new NextRequest("http://localhost/api/me/chat/bootstrap", { method: "POST" });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(429);
    expect(json.error).toBe("RATE_LIMITED");
  });

  it("creates anonymous actor and applies cookie", async () => {
    mockResolveActor.mockResolvedValueOnce(null);
    mockCreateAnonymous.mockResolvedValueOnce({
      userId: "anon-1",
      email: "play_anon@xpersona.co",
      isAnonymous: true,
      accountType: "agent",
      source: "auto_created",
      cookieToken: "cookie-token",
    });
    const req = new NextRequest("http://localhost/api/me/chat/bootstrap", { method: "POST" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.viewer.isAnonymous).toBe(true);
    expect(mockApplyCookie).toHaveBeenCalledTimes(1);
  });
});
