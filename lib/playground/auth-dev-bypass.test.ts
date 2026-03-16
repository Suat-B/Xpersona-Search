import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocalDevBypassAuth } from "@/lib/playground/auth-dev-bypass";

describe("playground auth dev bypass", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the local HF router token for non-production Binary IDE requests", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("HF_TOKEN", "hf_local_dev_token");
    vi.stubEnv("HF_ROUTER_TOKEN", "");

    expect(getLocalDevBypassAuth("hf_local_dev_token")).toEqual({
      userId: "local-dev-hf-router",
      email: "suat.bastug@icloud.com",
      apiKeyPrefix: "hf_local",
    });
  });

  it("does not allow the bypass in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HF_TOKEN", "hf_local_dev_token");

    expect(getLocalDevBypassAuth("hf_local_dev_token")).toBeNull();
  });
});
