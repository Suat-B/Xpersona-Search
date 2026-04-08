import { describe, expect, it } from "vitest";
import { resolvePlaygroundModelSelection } from "@/lib/playground/model-registry";

describe("playground model registry BYO selection", () => {
  it("prefers a connected host-supplied provider when the request targets that provider", () => {
    const selection = resolvePlaygroundModelSelection({
      requested: "openai",
      userConnectedModels: [
        {
          alias: "user:openai",
          provider: "openai",
          displayName: "OpenAI",
          model: "gpt-5.4",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          authSource: "user_connected",
          candidateSource: "user_connected",
          preferred: true,
        },
      ],
    });

    expect(selection.resolvedAlias).toBe("user:openai");
    expect(selection.resolvedEntry.authSource).toBe("user_connected");
    expect(selection.resolvedEntry.runtimeApiKey).toBe("sk-test");
  });

  it("can resolve an OpenAI-family request through an OAuth hub route", () => {
    const selection = resolvePlaygroundModelSelection({
      requested: "openai",
      userConnectedModels: [
        {
          alias: "user:azure_openai",
          provider: "azure_openai",
          displayName: "Azure OpenAI",
          model: "gpt-4.1",
          baseUrl: "https://example.openai.azure.com/openai/v1",
          apiKey: "oauth-access-token",
          routeKind: "azure_openai_entra",
          routeReason: "Using Azure OpenAI for OpenAI-family models.",
          modelFamilies: ["openai", "gpt"],
          authSource: "user_connected",
          candidateSource: "user_connected",
          preferred: true,
        },
      ],
    });

    expect(selection.resolvedAlias).toBe("user:azure_openai");
    expect(selection.resolvedEntry.routeKind).toBe("azure_openai_entra");
  });

  it("keeps the OpenRouter free ladder ordered for fallback", () => {
    const selection = resolvePlaygroundModelSelection({
      requested: "openrouter",
      userConnectedModels: [
        {
          alias: "user:openrouter",
          provider: "openrouter",
          displayName: "OpenRouter Free: gpt-oss-20b",
          model: "openai/gpt-oss-20b:free",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "sk-or-test",
          authSource: "user_connected",
          candidateSource: "user_connected",
          preferred: true,
        },
        {
          alias: "user:openrouter:stepfun_step_3_5_flash_free",
          provider: "openrouter",
          displayName: "OpenRouter Free: Step 3.5 Flash",
          model: "stepfun/step-3.5-flash:free",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "sk-or-test",
          authSource: "user_connected",
          candidateSource: "user_connected",
        },
        {
          alias: "user:openrouter:qwen_qwen3_6_plus_preview_free",
          provider: "openrouter",
          displayName: "OpenRouter Free: Qwen 3.6 Plus Preview",
          model: "qwen/qwen3.6-plus-preview:free",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "sk-or-test",
          authSource: "user_connected",
          candidateSource: "user_connected",
        },
      ],
    });

    expect(selection.resolvedAlias).toBe("user:openrouter");
    expect(selection.resolvedEntry.model).toBe("openai/gpt-oss-20b:free");
    expect(selection.fallbackChain.map((entry) => entry.alias)).toEqual([
      "user:openrouter:stepfun_step_3_5_flash_free",
      "user:openrouter:qwen_qwen3_6_plus_preview_free",
    ]);
  });
});
