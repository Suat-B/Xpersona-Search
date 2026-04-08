import { describe, expect, it } from "vitest";
import { buildUserConnectedModelCandidates, listProviderProfiles } from "./providers.js";
import type { BinaryConnectionRecord } from "./connections.js";

function createProviderRecord(overrides: Partial<BinaryConnectionRecord> = {}): BinaryConnectionRecord {
  return {
    id: "provider-openai",
    name: "OpenAI model provider",
    transport: "http",
    url: "https://api.openai.com/v1",
    authMode: "api-key",
    enabled: true,
    source: "guided",
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:00:00.000Z",
    providerId: "openai",
    providerAuthStrategy: "api_key",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.4",
    ...overrides,
  };
}

describe("provider helpers", () => {
  it("builds connected provider profiles from connection records", () => {
    const profiles = listProviderProfiles({
      records: [createProviderRecord()],
      secrets: {
        "provider-openai": { apiKey: "sk-test" },
      },
      defaultProviderId: "openai",
    });

    const openai = profiles.find((item) => item.id === "openai");
    expect(openai?.connected).toBe(true);
    expect(openai?.isDefault).toBe(true);
    expect(openai?.configuredModel).toBe("gpt-5.4");
    expect(openai?.connectionMode).toBe("api_key_only");
  });

  it("builds user-connected model candidates for hosted assist routing", () => {
    const candidates = buildUserConnectedModelCandidates({
      records: [createProviderRecord()],
      secrets: {
        "provider-openai": { apiKey: "sk-test" },
      },
      defaultProviderId: "openai",
    });

    expect(candidates).toEqual([
      {
        alias: "user:openai",
        provider: "openai",
        displayName: "OpenAI",
        model: "gpt-5.4",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        modelFamilies: ["openai", "gpt"],
        authSource: "user_connected",
        candidateSource: "user_connected",
        preferred: true,
        latencyTier: "balanced",
        reasoningDefault: "medium",
        intendedUse: "chat",
      },
    ]);
  });

  it("expands OpenRouter into a fastest-free-first fallback ladder", () => {
    const candidates = buildUserConnectedModelCandidates({
      records: [
        createProviderRecord({
          id: "provider-openrouter",
          providerId: "openrouter",
          defaultBaseUrl: "https://openrouter.ai/api/v1",
          defaultModel: "openai/gpt-oss-120b",
        }),
      ],
      secrets: {
        "provider-openrouter": { apiKey: "sk-or-test" },
      },
      defaultProviderId: "openrouter",
    });

    expect(candidates).toEqual([
      {
        alias: "user:openrouter",
        provider: "openrouter",
        displayName: "OpenRouter Free: Step 3.5 Flash",
        model: "stepfun/step-3.5-flash:free",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-test",
        authSource: "user_connected",
        candidateSource: "user_connected",
        preferred: true,
        latencyTier: "fast",
        reasoningDefault: "low",
        intendedUse: "action",
      },
      {
        alias: "user:openrouter:openai_gpt_oss_20b_free",
        provider: "openrouter",
        displayName: "OpenRouter Free: gpt-oss-20b",
        model: "openai/gpt-oss-20b:free",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-test",
        authSource: "user_connected",
        candidateSource: "user_connected",
        preferred: false,
        latencyTier: "fast",
        reasoningDefault: "low",
        intendedUse: "action",
      },
      {
        alias: "user:openrouter:qwen_qwen3_6_plus_free",
        provider: "openrouter",
        displayName: "OpenRouter Free: Qwen 3.6 Plus",
        model: "qwen/qwen3.6-plus:free",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-test",
        authSource: "user_connected",
        candidateSource: "user_connected",
        preferred: false,
        latencyTier: "balanced",
        reasoningDefault: "low",
        intendedUse: "action",
      },
      {
        alias: "user:openrouter:qwen_qwen3_coder_free",
        provider: "openrouter",
        displayName: "OpenRouter Free: Qwen 3 Coder",
        model: "qwen/qwen3-coder:free",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-test",
        authSource: "user_connected",
        candidateSource: "user_connected",
        preferred: false,
        latencyTier: "balanced",
        reasoningDefault: "low",
        intendedUse: "action",
      },
      {
        alias: "user:openrouter:openai_gpt_oss_120b_free",
        provider: "openrouter",
        displayName: "OpenRouter Free: gpt-oss-120b",
        model: "openai/gpt-oss-120b:free",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-test",
        authSource: "user_connected",
        candidateSource: "user_connected",
        preferred: false,
        latencyTier: "thorough",
        reasoningDefault: "medium",
        intendedUse: "repair",
      },
      {
        alias: "user:openrouter:openrouter_free",
        provider: "openrouter",
        displayName: "OpenRouter Free Router",
        model: "openrouter/free",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-test",
        authSource: "user_connected",
        candidateSource: "user_connected",
        preferred: false,
        latencyTier: "balanced",
        reasoningDefault: "low",
        intendedUse: "chat",
      },
    ]);
  });

  it("builds OAuth-capable provider profiles with browser-auth metadata", () => {
    const profiles = listProviderProfiles({
      records: [],
      secrets: {},
      defaultProviderId: null,
      includeBeta: true,
    });

    const gemini = profiles.find((item) => item.id === "gemini");
    expect(gemini?.supportsBrowserAuth).toBe(true);
    expect(gemini?.connectionMode).toBe("direct_oauth_pkce");
  });

  it("exposes browser-session providers with local import support", () => {
    const profiles = listProviderProfiles({
      records: [],
      secrets: {},
      defaultProviderId: null,
      includeBeta: true,
    });

    const chatgpt = profiles.find((item) => item.id === "chatgpt_portal");
    expect(chatgpt?.supportsBrowserAuth).toBe(true);
    expect(chatgpt?.supportsLocalImport).toBe(true);
    expect(chatgpt?.runtimeReady).toBe(true);
    expect(chatgpt?.connectionMode).toBe("portal_session");
  });

  it("does not offer link-only browser-session providers as runtime candidates", () => {
    const candidates = buildUserConnectedModelCandidates({
      records: [
        createProviderRecord({
          id: "provider-chatgpt",
          providerId: "chatgpt_portal",
          providerAuthStrategy: "browser_session",
          authMode: "oauth",
          defaultBaseUrl: "https://chatgpt.com",
          runtimeReady: false,
        }),
      ],
      secrets: {
        "provider-chatgpt": { accessToken: "portal-token" },
      },
      defaultProviderId: "chatgpt_portal",
    });

    expect(candidates).toEqual([]);
  });

  it("offers bridge-backed browser-session providers as runtime candidates", () => {
    const candidates = buildUserConnectedModelCandidates({
      records: [
        createProviderRecord({
          id: "provider-chatgpt-bridge",
          providerId: "chatgpt_portal",
          providerAuthStrategy: "browser_session",
          authMode: "oauth",
          defaultBaseUrl: "http://127.0.0.1:8000/v1",
          defaultModel: "gpt-5.4",
          runtimeReady: true,
          routeKind: "chatgpt_portal_bridge",
          routeLabel: "ChatGPT / Codex via local bridge",
          routeReason: "Using a verified local OpenAI-compatible bridge for the linked OpenAI ChatGPT account.",
          modelFamilies: ["openai", "gpt", "chatgpt"],
        }),
      ],
      secrets: {
        "provider-chatgpt-bridge": {
          sessionToken: "portal-session-token",
          secretHeaders: {
            "x-bridge-provider": "chatgpt_portal",
          },
        },
      },
      defaultProviderId: "chatgpt_portal",
    });

    expect(candidates).toEqual([
      {
        alias: "user:chatgpt_portal",
        provider: "chatgpt_portal",
        displayName: "OpenAI ChatGPT",
        model: "gpt-5.4",
        baseUrl: "http://127.0.0.1:8000/v1",
        apiKey: "portal-session-token",
        routeKind: "chatgpt_portal_bridge",
        routeLabel: "ChatGPT / Codex via local bridge",
        routeReason: "Using a verified local OpenAI-compatible bridge for the linked OpenAI ChatGPT account.",
        modelFamilies: ["openai", "gpt", "chatgpt"],
        extraHeaders: {
          "x-bridge-provider": "chatgpt_portal",
        },
        authSource: "user_connected",
        candidateSource: "user_connected",
        preferred: true,
        latencyTier: "thorough",
        reasoningDefault: "high",
        intendedUse: "action",
      },
    ]);
  });

  it("expands bridge-backed providers when dynamic model catalogs are available", () => {
    const candidates = buildUserConnectedModelCandidates({
      records: [
        createProviderRecord({
          id: "provider-chatgpt-bridge-dynamic",
          providerId: "chatgpt_portal",
          providerAuthStrategy: "browser_session",
          authMode: "oauth",
          defaultBaseUrl: "http://127.0.0.1:8000/codex/v1",
          defaultModel: "gpt-5.3-codex",
          availableModels: ["gpt-5.3-codex", "gpt-5.2-codex"],
          runtimeReady: true,
          routeKind: "chatgpt_portal_bridge",
          routeLabel: "ChatGPT / Codex via local bridge",
          routeReason: "Using a verified local OpenAI-compatible bridge for the linked OpenAI ChatGPT account.",
          modelFamilies: ["openai", "gpt", "chatgpt"],
        }),
      ],
      secrets: {
        "provider-chatgpt-bridge-dynamic": {
          sessionToken: "portal-session-token",
        },
      },
      defaultProviderId: "chatgpt_portal",
    });

    expect(candidates).toEqual([
      {
        alias: "user:chatgpt_portal",
        provider: "chatgpt_portal",
        displayName: "OpenAI ChatGPT",
        model: "gpt-5.3-codex",
        baseUrl: "http://127.0.0.1:8000/codex/v1",
        apiKey: "portal-session-token",
        routeKind: "chatgpt_portal_bridge",
        routeLabel: "ChatGPT / Codex via local bridge",
        routeReason: "Using a verified local OpenAI-compatible bridge for the linked OpenAI ChatGPT account.",
        modelFamilies: ["openai", "gpt", "chatgpt"],
        authSource: "user_connected",
        candidateSource: "user_connected",
        preferred: true,
        latencyTier: "thorough",
        reasoningDefault: "high",
        intendedUse: "action",
      },
      {
        alias: "user:chatgpt_portal:gpt_5_2_codex",
        provider: "chatgpt_portal",
        displayName: "OpenAI ChatGPT: gpt-5.2-codex",
        model: "gpt-5.2-codex",
        baseUrl: "http://127.0.0.1:8000/codex/v1",
        apiKey: "portal-session-token",
        routeKind: "chatgpt_portal_bridge",
        routeLabel: "ChatGPT / Codex via local bridge",
        routeReason: "Using a verified local OpenAI-compatible bridge for the linked OpenAI ChatGPT account.",
        modelFamilies: ["openai", "gpt", "chatgpt"],
        authSource: "user_connected",
        candidateSource: "user_connected",
        preferred: false,
        latencyTier: "thorough",
        reasoningDefault: "high",
        intendedUse: "action",
      },
    ]);
  });
});
