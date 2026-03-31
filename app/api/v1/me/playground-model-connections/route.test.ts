import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const mockGetAuthUser = vi.hoisted(() => vi.fn());
const mockGetProfile = vi.hoisted(() => vi.fn());
const mockListConnections = vi.hoisted(() => vi.fn());
const mockGetByomPreferences = vi.hoisted(() => vi.fn());
const mockGetBrowserAuthAvailability = vi.hoisted(() => vi.fn());
const mockValidateOpenAiApiKey = vi.hoisted(() => vi.fn());
const mockBuildProviderSecret = vi.hoisted(() => vi.fn());
const mockUpsertConnection = vi.hoisted(() => vi.fn());
const mockUpsertProfile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-utils", () => ({
  getAuthUser: mockGetAuthUser,
}));

vi.mock("@/lib/playground/store", () => ({
  getUserPlaygroundProfile: mockGetProfile,
  upsertPlaygroundProviderConnection: mockUpsertConnection,
  upsertUserPlaygroundProfile: mockUpsertProfile,
}));

vi.mock("@/lib/playground/byom", () => ({
  buildProviderAlias: vi.fn(() => "user:openai"),
  buildProviderSecret: mockBuildProviderSecret,
  getBrowserAuthAvailability: mockGetBrowserAuthAvailability,
  getPlaygroundByomPreferences: mockGetByomPreferences,
  listUserConnectedModels: mockListConnections,
  updateStablePreferencesWithByom: vi.fn(() => ({ byom: { preferredChatModelSource: "user_connected" } })),
  validateOpenAiApiKey: mockValidateOpenAiApiKey,
}));

describe("playground model connection routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });
    mockGetProfile.mockResolvedValue({
      preferredModelAlias: null,
      stablePreferences: null,
    });
    mockListConnections.mockResolvedValue([]);
    mockGetByomPreferences.mockReturnValue({
      preferredChatModelSource: "platform",
      fallbackToPlatformModel: true,
    });
    mockGetBrowserAuthAvailability.mockReturnValue({
      enabled: false,
      reason: "disabled",
    });
    mockBuildProviderSecret.mockReturnValue("encrypted");
    mockValidateOpenAiApiKey.mockResolvedValue({
      ok: true,
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-5.4",
      availableModels: ["gpt-5.4"],
    });
    mockUpsertConnection.mockResolvedValue({
      id: "conn-1",
      provider: "openai",
      alias: "user:openai",
      displayName: "Your OpenAI model",
      authMode: "api_key",
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-5.4",
      status: "active",
      lastValidatedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastValidationError: null,
    });
    mockUpsertProfile.mockResolvedValue({});
  });

  it("returns connected model settings", async () => {
    mockListConnections.mockResolvedValue([
      {
        id: "conn-1",
        alias: "user:openai",
        provider: "openai",
      },
    ]);
    const res = await GET(new NextRequest("http://localhost/api/v1/me/playground-model-connections"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.preferences.preferredChatModelSource).toBe("platform");
    expect(json.data.connections).toHaveLength(1);
  });

  it("validates and stores an OpenAI API key connection", async () => {
    const req = new NextRequest("http://localhost/api/v1/me/playground-model-connections", {
      method: "POST",
      body: JSON.stringify({
        provider: "openai",
        authMode: "api_key",
        apiKey: "sk-test",
        defaultModel: "gpt-5.4",
      }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockValidateOpenAiApiKey).toHaveBeenCalledTimes(1);
    expect(mockUpsertConnection).toHaveBeenCalledTimes(1);
    expect(mockUpsertProfile).toHaveBeenCalledTimes(1);
  });
});
