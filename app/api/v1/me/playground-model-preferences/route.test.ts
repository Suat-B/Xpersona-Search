import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "./route";

const mockGetAuthUser = vi.hoisted(() => vi.fn());
const mockGetProfile = vi.hoisted(() => vi.fn());
const mockUpsertProfile = vi.hoisted(() => vi.fn());
const mockGetByomPreferences = vi.hoisted(() => vi.fn());
const mockUpdateStablePreferencesWithByom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-utils", () => ({
  getAuthUser: mockGetAuthUser,
}));

vi.mock("@/lib/playground/store", () => ({
  getUserPlaygroundProfile: mockGetProfile,
  upsertUserPlaygroundProfile: mockUpsertProfile,
}));

vi.mock("@/lib/playground/byom", () => ({
  getPlaygroundByomPreferences: mockGetByomPreferences,
  updateStablePreferencesWithByom: mockUpdateStablePreferencesWithByom,
}));

describe("playground model preference routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProfile.mockResolvedValue({
      preferredModelAlias: "user:openai",
      stablePreferences: { byom: { preferredChatModelSource: "user_connected" } },
    });
    mockGetByomPreferences.mockReturnValue({
      preferredChatModelSource: "user_connected",
      fallbackToPlatformModel: true,
    });
    mockUpdateStablePreferencesWithByom.mockReturnValue({
      byom: {
        preferredChatModelSource: "platform",
        fallbackToPlatformModel: false,
      },
    });
    mockUpsertProfile.mockResolvedValue({
      preferredModelAlias: null,
      stablePreferences: {
        byom: {
          preferredChatModelSource: "platform",
          fallbackToPlatformModel: false,
        },
      },
    });
  });

  it("returns persisted preferences", async () => {
    const res = await GET(new NextRequest("http://localhost/api/v1/me/playground-model-preferences"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.preferredModelAlias).toBe("user:openai");
    expect(json.data.preferredChatModelSource).toBe("user_connected");
  });

  it("updates preferences", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/me/playground-model-preferences", {
        method: "PATCH",
        body: JSON.stringify({
          preferredChatModelSource: "platform",
          fallbackToPlatformModel: false,
          preferredModelAlias: null,
        }),
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockUpsertProfile).toHaveBeenCalledTimes(1);
    expect(json.data.preferredModelAlias).toBeNull();
  });
});
