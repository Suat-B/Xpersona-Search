import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUserPlaygroundProfile = vi.hoisted(() => vi.fn());
const mockGetConnectionByAlias = vi.hoisted(() => vi.fn());
const mockListConnections = vi.hoisted(() => vi.fn());
const mockResolveSelection = vi.hoisted(() => vi.fn());
const mockResolveToken = vi.hoisted(() => vi.fn());
const mockDecryptSecretPayload = vi.hoisted(() => vi.fn());

vi.mock("@/lib/playground/store", () => ({
  getUserPlaygroundProfile: mockGetUserPlaygroundProfile,
  getPlaygroundProviderConnectionByAlias: mockGetConnectionByAlias,
  listPlaygroundProviderConnections: mockListConnections,
}));

vi.mock("@/lib/playground/model-registry", () => ({
  DEFAULT_PLAYGROUND_MODEL_ALIAS: "kimi-k2",
  resolvePlaygroundModelSelection: mockResolveSelection,
  resolvePlaygroundModelToken: mockResolveToken,
}));

vi.mock("@/lib/security/encrypted-secrets", () => ({
  decryptSecretPayload: mockDecryptSecretPayload,
  encryptSecretPayload: vi.fn(() => "encrypted"),
}));

describe("playground BYOM helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSelection.mockReturnValue({
      requested: "kimi-k2",
      requestedAlias: "kimi-k2",
      resolvedAlias: "kimi-k2",
      resolvedEntry: {
        model: "moonshotai/Kimi-K2-Instruct",
        displayName: "Kimi K2",
        description: "Default",
        provider: "hf",
        baseUrl: "https://router.huggingface.co/v1",
        capabilities: { supportsToolLoop: true, supportedTools: [] },
        certification: "tool_ready",
      },
    });
    mockResolveToken.mockReturnValue("hf-token");
    mockGetUserPlaygroundProfile.mockResolvedValue(null);
    mockGetConnectionByAlias.mockResolvedValue(null);
    mockListConnections.mockResolvedValue([]);
    vi.stubEnv("OPENAI_BROWSER_AUTH_ENABLED", "");
  });

  it("reads BYOM preferences from stable preferences", async () => {
    const { getPlaygroundByomPreferences } = await import("./byom");
    expect(
      getPlaygroundByomPreferences({
        stablePreferences: {
          byom: {
            preferredChatModelSource: "user_connected",
            fallbackToPlatformModel: false,
          },
        },
      } as any)
    ).toEqual({
      preferredChatModelSource: "user_connected",
      fallbackToPlatformModel: false,
    });
  });

  it("falls back to the platform model when no user connection exists", async () => {
    const { resolveChatModelAccess } = await import("./byom");
    const resolved = await resolveChatModelAccess({
      userId: "u1",
      requestedSource: "user_connected",
      requestedModel: "user:openai",
      fallbackToPlatformModel: true,
    });
    expect(resolved.source).toBe("platform");
    expect(resolved.fallbackApplied).toBe(true);
    expect(resolved.resolvedAlias).toBe("kimi-k2");
  });

  it("returns the connected model when a stored OpenAI key exists", async () => {
    mockGetConnectionByAlias.mockResolvedValue({
      id: "conn-1",
      alias: "user:openai",
      displayName: "My OpenAI",
      defaultModel: "gpt-5.4",
      baseUrl: "https://api.openai.com/v1",
      secretEncrypted: "secret",
    });
    mockDecryptSecretPayload.mockReturnValue({
      authMode: "api_key",
      apiKey: "sk-test",
    });
    const { resolveChatModelAccess } = await import("./byom");
    const resolved = await resolveChatModelAccess({
      userId: "u1",
      requestedSource: "user_connected",
      requestedModel: "user:openai",
    });
    expect(resolved.source).toBe("user_connected");
    expect(resolved.resolvedAlias).toBe("user:openai");
    expect(resolved.resolvedModel).toBe("gpt-5.4");
    expect(resolved.token).toBe("sk-test");
  });

  it("reports browser auth as disabled by default", async () => {
    const { getBrowserAuthAvailability } = await import("./byom");
    expect(getBrowserAuthAvailability()).toEqual({
      enabled: false,
      reason: "Official provider account linking is not enabled on this deployment yet.",
    });
  });
});
