import {
  buildConnectionView,
  connectionHasRequiredSecret,
  type BinaryConnectionRecord,
  type BinaryConnectionSecretRecord,
  type BinaryConnectionView,
  type BinaryProviderConnectionMode,
  type BinaryProviderModelCoverageMode,
  type BinaryProviderOauthCapability,
  type BinaryProviderAuthStrategy,
  type BinaryProviderId,
} from "./connections.js";

export type BinaryProviderRuntimeKind = "openai_compatible" | "anthropic_native" | "browser_session";
export type BinaryProviderValidationKind =
  | "openai_models"
  | "openai_chat_probe"
  | "anthropic_models"
  | "browser_session_import";

export type BinaryProviderCatalogEntry = {
  id: BinaryProviderId;
  displayName: string;
  authStrategy: BinaryProviderAuthStrategy;
  connectionMode: BinaryProviderConnectionMode;
  oauthCapability: BinaryProviderOauthCapability;
  modelCoverageMode: BinaryProviderModelCoverageMode;
  runtimeKind: BinaryProviderRuntimeKind;
  validationKind: BinaryProviderValidationKind;
  defaultBaseUrl: string;
  defaultModel: string;
  browserConnectUrl: string;
  browserDocsUrl: string;
  apiKeyLabel: string;
  accountLabel: string;
  availabilityReason?: string;
  supportsRevocation?: boolean;
  supportsDynamicModelCatalog?: boolean;
  supportsLocalImport?: boolean;
  modelFamilies?: string[];
  beta?: boolean;
};

export type BinaryProviderProfile = {
  id: BinaryProviderId;
  displayName: string;
  authStrategy: BinaryProviderAuthStrategy;
  connectionMode: BinaryProviderConnectionMode;
  oauthCapability: BinaryProviderOauthCapability;
  modelCoverageMode: BinaryProviderModelCoverageMode;
  runtimeKind: BinaryProviderRuntimeKind;
  validationKind: BinaryProviderValidationKind;
  browserConnectUrl: string;
  browserDocsUrl: string;
  defaultBaseUrl: string;
  defaultModel: string;
  supportsBrowserAuth: boolean;
  supportsRevocation: boolean;
  supportsDynamicModelCatalog: boolean;
  supportsLocalImport: boolean;
  configuredBaseUrl?: string;
  configuredModel?: string;
  connected: boolean;
  authReady: boolean;
  runtimeReady: boolean;
  enabled: boolean;
  status: BinaryConnectionView["status"];
  lastValidatedAt?: string;
  lastError?: string;
  isDefault: boolean;
  connectionId?: string;
  hasSecret: boolean;
  availabilityReason?: string;
  linkedAccountLabel?: string;
  linkedAt?: string;
  lastRefreshedAt?: string;
  authHealth?: BinaryConnectionRecord["authHealth"];
  refreshFailureCount?: number;
  runtimeReadinessReason?: string;
  routeKind?: string;
  routeLabel?: string;
  routeReason?: string;
  modelFamilies?: string[];
  availableModels?: string[];
};

export type BinaryUserConnectedModelCandidate = {
  alias: string;
  provider: string;
  displayName: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  routeKind?: string;
  routeLabel?: string;
  routeReason?: string;
  modelFamilies?: string[];
  extraHeaders?: Record<string, string>;
  authSource: "user_connected";
  candidateSource: "user_connected";
  preferred: boolean;
  latencyTier?: "fast" | "balanced" | "thorough";
  reasoningDefault?: "low" | "medium" | "high";
  intendedUse?: "chat" | "action" | "repair";
};

type ProviderCandidateTemplate = {
  alias: string;
  displayName: string;
  model: string;
  preferred: boolean;
  latencyTier?: "fast" | "balanced" | "thorough";
  reasoningDefault?: "low" | "medium" | "high";
  intendedUse?: "chat" | "action" | "repair";
};

const OPENROUTER_FREE_MODEL_LADDER: Array<{
  model: string;
  displayName: string;
  latencyTier: "fast" | "balanced" | "thorough";
  reasoningDefault: "low" | "medium" | "high";
  intendedUse: "chat" | "action" | "repair";
}> = [
  {
    model: "google/gemma-4-26b-a4b-it:free",
    displayName: "OpenRouter Free: Gemma 4 26B",
    latencyTier: "fast",
    reasoningDefault: "low",
    intendedUse: "action",
  },
  {
    model: "google/gemma-4-31b-it:free",
    displayName: "OpenRouter Free: Gemma 4 31B",
    latencyTier: "balanced",
    reasoningDefault: "low",
    intendedUse: "action",
  },
  {
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    displayName: "OpenRouter Free: Nemotron 3 Super 120B",
    latencyTier: "thorough",
    reasoningDefault: "medium",
    intendedUse: "repair",
  },
  {
    model: "minimax/minimax-m2.5:free",
    displayName: "OpenRouter Free: MiniMax M2.5",
    latencyTier: "balanced",
    reasoningDefault: "low",
    intendedUse: "action",
  },
  {
    model: "liquid/lfm-2.5-1.2b-instruct:free",
    displayName: "OpenRouter Free: LFM 2.5 1.2B Instruct",
    latencyTier: "fast",
    reasoningDefault: "low",
    intendedUse: "chat",
  },
  {
    model: "liquid/lfm-2.5-1.2b-thinking:free",
    displayName: "OpenRouter Free: LFM 2.5 1.2B Thinking",
    latencyTier: "balanced",
    reasoningDefault: "medium",
    intendedUse: "repair",
  },
  {
    model: "openrouter/free",
    displayName: "OpenRouter Free Router",
    latencyTier: "balanced",
    reasoningDefault: "low",
    intendedUse: "chat",
  },
];

const PROVIDER_CATALOG: BinaryProviderCatalogEntry[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    authStrategy: "api_key",
    connectionMode: "api_key_only",
    oauthCapability: "none",
    modelCoverageMode: "provider_direct",
    runtimeKind: "openai_compatible",
    validationKind: "openai_models",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.4",
    browserConnectUrl: "https://platform.openai.com/settings/organization/api-keys",
    browserDocsUrl: "https://developers.openai.com/api/reference/resources/models/methods/list",
    apiKeyLabel: "OpenAI API key",
    accountLabel: "OpenAI account",
    availabilityReason: "OpenAI currently exposes API-key authentication for direct API access, not native browser OAuth linking.",
    supportsDynamicModelCatalog: true,
    modelFamilies: ["openai", "gpt"],
  },
  {
    id: "chatgpt_portal",
    displayName: "OpenAI ChatGPT",
    authStrategy: "browser_session",
    connectionMode: "portal_session",
    oauthCapability: "none",
    modelCoverageMode: "provider_direct",
    runtimeKind: "browser_session",
    validationKind: "browser_session_import",
    defaultBaseUrl: "https://chatgpt.com",
    defaultModel: "gpt-5.1-codex-max",
    browserConnectUrl: "https://chatgpt.com",
    browserDocsUrl: "https://platform.openai.com/docs/api-reference/authentication?api-mode=responses",
    apiKeyLabel: "OpenAI API key",
    accountLabel: "ChatGPT / Codex account",
    availabilityReason:
      "Binary can link an existing ChatGPT or Codex browser account session locally, but OpenAI direct API access remains API-key based.",
    supportsLocalImport: true,
    modelFamilies: ["openai", "gpt", "chatgpt"],
    beta: true,
  },
  {
    id: "qwen_dashscope",
    displayName: "Qwen (DashScope)",
    authStrategy: "api_key",
    connectionMode: "api_key_only",
    oauthCapability: "none",
    modelCoverageMode: "provider_direct",
    runtimeKind: "openai_compatible",
    validationKind: "openai_models",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    browserConnectUrl: "https://www.alibabacloud.com/help/en/model-studio/get-api-key",
    browserDocsUrl: "https://www.alibabacloud.com/help/en/model-studio/qwen-api-reference/",
    apiKeyLabel: "DashScope API key",
    accountLabel: "Alibaba Cloud Model Studio account",
    availabilityReason: "DashScope currently uses API keys for direct access, so Binary cannot offer true browser OAuth linking for Qwen yet.",
    supportsDynamicModelCatalog: true,
    modelFamilies: ["qwen", "qwen_dashscope"],
  },
  {
    id: "qwen_portal",
    displayName: "Qwen Portal",
    authStrategy: "browser_session",
    connectionMode: "portal_session",
    oauthCapability: "none",
    modelCoverageMode: "provider_direct",
    runtimeKind: "browser_session",
    validationKind: "browser_session_import",
    defaultBaseUrl: "https://chat.qwen.ai",
    defaultModel: "qwen-plus",
    browserConnectUrl: "https://chat.qwen.ai",
    browserDocsUrl: "https://www.alibabacloud.com/help/en/model-studio/qwen-code",
    apiKeyLabel: "DashScope API key",
    accountLabel: "Qwen account",
    availabilityReason:
      "Binary can link a local Qwen browser account session when Qwen credentials are present on the machine, while DashScope direct API access remains API-key based.",
    supportsLocalImport: true,
    modelFamilies: ["qwen", "qwen_portal"],
    beta: true,
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    authStrategy: "api_key",
    connectionMode: "api_key_only",
    oauthCapability: "none",
    modelCoverageMode: "provider_direct",
    runtimeKind: "openai_compatible",
    validationKind: "openai_models",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "stepfun/step-3.5-flash:free",
    browserConnectUrl: "https://openrouter.ai/settings/keys",
    browserDocsUrl: "https://openrouter.ai/docs/quickstart",
    apiKeyLabel: "OpenRouter API key",
    accountLabel: "OpenRouter account",
    availabilityReason: "OpenRouter currently authenticates with API keys rather than native browser OAuth account linking.",
    supportsDynamicModelCatalog: true,
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    authStrategy: "api_key",
    connectionMode: "api_key_only",
    oauthCapability: "none",
    modelCoverageMode: "provider_direct",
    runtimeKind: "anthropic_native",
    validationKind: "anthropic_models",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    browserConnectUrl: "https://console.anthropic.com/settings/keys",
    browserDocsUrl: "https://docs.anthropic.com",
    apiKeyLabel: "Anthropic API key",
    accountLabel: "Anthropic Console account",
    availabilityReason: "Anthropic direct API access is API-key based today, so Binary cannot offer true browser OAuth linking here yet.",
    supportsDynamicModelCatalog: true,
    modelFamilies: ["anthropic", "claude"],
  },
  {
    id: "gemini",
    displayName: "Gemini",
    authStrategy: "oauth_pkce",
    connectionMode: "direct_oauth_pkce",
    oauthCapability: "pkce_public_client",
    modelCoverageMode: "provider_direct",
    runtimeKind: "openai_compatible",
    validationKind: "openai_chat_probe",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-pro",
    browserConnectUrl: "https://ai.google.dev/gemini-api/docs/oauth",
    browserDocsUrl: "https://ai.google.dev/gemini-api/docs/oauth",
    apiKeyLabel: "Google AI Studio API key",
    accountLabel: "Google AI Studio account",
    supportsRevocation: true,
    supportsDynamicModelCatalog: true,
    modelFamilies: ["gemini", "google"],
  },
  {
    id: "groq",
    displayName: "Groq",
    authStrategy: "api_key",
    connectionMode: "api_key_only",
    oauthCapability: "none",
    modelCoverageMode: "provider_direct",
    runtimeKind: "openai_compatible",
    validationKind: "openai_models",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    browserConnectUrl: "https://console.groq.com/keys",
    browserDocsUrl: "https://console.groq.com/docs",
    apiKeyLabel: "Groq API key",
    accountLabel: "Groq Console account",
    availabilityReason: "Groq direct API access is API-key based today, so Binary cannot offer true browser OAuth linking yet.",
    supportsDynamicModelCatalog: true,
  },
  {
    id: "github_models",
    displayName: "GitHub Models",
    authStrategy: "api_key",
    connectionMode: "unsupported",
    oauthCapability: "none",
    modelCoverageMode: "hub_catalog",
    runtimeKind: "openai_compatible",
    validationKind: "openai_models",
    defaultBaseUrl: "https://models.inference.ai.azure.com",
    defaultModel: "gpt-4.1",
    browserConnectUrl: "https://github.com/settings/personal-access-tokens",
    browserDocsUrl: "https://docs.github.com/en/github-models",
    apiKeyLabel: "GitHub token",
    accountLabel: "GitHub account",
    availabilityReason: "GitHub Models is token-based today and is not exposed as a clean native browser OAuth route for Binary.",
    supportsDynamicModelCatalog: true,
    beta: true,
    modelFamilies: ["openai", "gpt", "github_models"],
  },
  {
    id: "azure_openai",
    displayName: "Azure OpenAI",
    authStrategy: "oauth_pkce",
    connectionMode: "hub_oauth",
    oauthCapability: "pkce_public_client",
    modelCoverageMode: "hub_catalog",
    runtimeKind: "openai_compatible",
    validationKind: "openai_chat_probe",
    defaultBaseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/v1",
    defaultModel: "gpt-4.1",
    browserConnectUrl: "https://portal.azure.com",
    browserDocsUrl: "https://learn.microsoft.com/azure/ai-services/openai/",
    apiKeyLabel: "Azure OpenAI credential",
    accountLabel: "Azure account",
    supportsRevocation: true,
    supportsDynamicModelCatalog: true,
    beta: true,
    modelFamilies: ["openai", "gpt", "azure_openai"],
  },
  {
    id: "vertex_ai",
    displayName: "Vertex AI",
    authStrategy: "oauth_pkce",
    connectionMode: "hub_oauth",
    oauthCapability: "pkce_public_client",
    modelCoverageMode: "hub_catalog",
    runtimeKind: "openai_compatible",
    validationKind: "openai_chat_probe",
    defaultBaseUrl: "https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT/locations/LOCATION/endpoints/openapi",
    defaultModel: "gemini-2.5-pro",
    browserConnectUrl: "https://console.cloud.google.com",
    browserDocsUrl: "https://cloud.google.com/vertex-ai/generative-ai/docs",
    apiKeyLabel: "Vertex credential",
    accountLabel: "Google Cloud account",
    supportsRevocation: true,
    supportsDynamicModelCatalog: true,
    beta: true,
    modelFamilies: ["gemini", "google", "vertex_ai"],
  },
];

export function listProviderCatalog(): BinaryProviderCatalogEntry[] {
  return PROVIDER_CATALOG.map((entry) => ({
    ...entry,
    ...(Array.isArray(entry.modelFamilies) ? { modelFamilies: [...entry.modelFamilies] } : {}),
  }));
}

export function getProviderCatalogEntry(providerId: string | null | undefined): BinaryProviderCatalogEntry | null {
  const normalized = String(providerId || "").trim().toLowerCase();
  if (!normalized) return null;
  return PROVIDER_CATALOG.find((entry) => entry.id === normalized) || null;
}

export function isProviderConnection(record: Pick<BinaryConnectionRecord, "providerId">): boolean {
  return Boolean(record.providerId && getProviderCatalogEntry(record.providerId));
}

export function buildProviderAlias(providerId: string): string {
  return `user:${String(providerId || "").trim().toLowerCase()}`;
}

function buildProviderModelAlias(providerId: string, model: string): string {
  const base = buildProviderAlias(providerId);
  const slug = String(model || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug ? `${base}:${slug}` : base;
}

export function getProviderConnectionName(entry: BinaryProviderCatalogEntry): string {
  return `${entry.displayName} model provider`;
}

function inferProviderLatencyTier(providerId: BinaryProviderId): "fast" | "balanced" | "thorough" {
  switch (providerId) {
    case "groq":
      return "fast";
    case "openrouter":
    case "qwen_portal":
    case "qwen_dashscope":
      return "balanced";
    case "chatgpt_portal":
    case "anthropic":
      return "thorough";
    default:
      return "balanced";
  }
}

function inferProviderReasoningDefault(providerId: BinaryProviderId): "low" | "medium" | "high" {
  switch (providerId) {
    case "openrouter":
    case "groq":
      return "low";
    case "chatgpt_portal":
    case "anthropic":
      return "high";
    default:
      return "medium";
  }
}

function inferProviderIntendedUse(providerId: BinaryProviderId): "chat" | "action" | "repair" {
  switch (providerId) {
    case "anthropic":
      return "repair";
    case "chatgpt_portal":
    case "gemini":
    case "qwen_portal":
    case "azure_openai":
    case "vertex_ai":
      return "action";
    default:
      return "chat";
  }
}

function buildProviderCandidateTemplates(input: {
  provider: BinaryProviderCatalogEntry;
  record: BinaryConnectionRecord;
  defaultProviderId?: string | null;
}): ProviderCandidateTemplate[] {
  if (input.provider.id === "openrouter") {
    const configuredModel = String(input.record.defaultModel || "").trim();
    const configuredIsFreeModel =
      configuredModel.endsWith(":free") ||
      configuredModel === "openrouter/free" ||
      OPENROUTER_FREE_MODEL_LADDER.some((entry) => entry.model === configuredModel);
    const explicitOrder = new Map(OPENROUTER_FREE_MODEL_LADDER.map((entry, index) => [entry.model, index] as const));
    const availableModels = Array.isArray(input.record.availableModels)
      ? input.record.availableModels.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const liveFreeModels = Array.isArray(input.record.availableModels)
      ? input.record.availableModels
          .map((item) => String(item || "").trim())
          .filter((item) => item.endsWith(":free") || item === "openrouter/free")
      : [];
    const mergedModels = (
      configuredModel && !configuredIsFreeModel
        ? [
            configuredModel,
            ...availableModels.filter(
              (model) => !model.endsWith(":free") && model !== "openrouter/free"
            ),
          ]
        : [
            ...OPENROUTER_FREE_MODEL_LADDER.map((entry) => entry.model),
            ...liveFreeModels,
          ]
    ).filter((model, index, list) => Boolean(model) && list.indexOf(model) === index);
    const rankedModels = mergedModels.sort((left, right) => {
      if (configuredModel && left === configuredModel) return -1;
      if (configuredModel && right === configuredModel) return 1;
      const leftIndex = explicitOrder.get(left);
      const rightIndex = explicitOrder.get(right);
      if (typeof leftIndex === "number" || typeof rightIndex === "number") {
        return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER);
      }
      return left.localeCompare(right);
    });
    return rankedModels.map((model, index) => {
      const known = OPENROUTER_FREE_MODEL_LADDER.find((entry) => entry.model === model);
      const inferredLatencyTier =
        known?.latencyTier ||
        (/(flash|mini|nano|1\.2b|2b|3b|4b|e2b)/i.test(model)
          ? "fast"
          : /(120b|405b|70b|80b)/i.test(model)
            ? "thorough"
            : "balanced");
      const inferredIntendedUse =
        known?.intendedUse ||
        (/coder|code/i.test(model) ? "action" : inferredLatencyTier === "fast" ? "action" : "chat");
      const displayName =
        known?.displayName ||
        (index === 0
          ? configuredModel && !configuredIsFreeModel
            ? `${input.provider.displayName}: ${model}`
            : input.provider.displayName
          : `${input.provider.displayName}: ${model}`);
      return {
        alias: index === 0 ? buildProviderAlias(input.provider.id) : buildProviderModelAlias(input.provider.id, model),
        displayName,
        model,
        preferred: index === 0 && input.defaultProviderId === input.provider.id,
        latencyTier: inferredLatencyTier,
        reasoningDefault: known?.reasoningDefault || "low",
        intendedUse: inferredIntendedUse,
      };
    });
  }
  const configuredModel =
    String(input.record.defaultModel || input.provider.defaultModel).trim() || input.provider.defaultModel;
  const availableModels = Array.isArray(input.record.availableModels)
    ? input.record.availableModels.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const orderedModels = [configuredModel, ...availableModels].filter(
    (model, index, list) => Boolean(model) && list.indexOf(model) === index
  );
  if (orderedModels.length > 1) {
    return orderedModels.map((model, index) => ({
      alias: index === 0 ? buildProviderAlias(input.provider.id) : buildProviderModelAlias(input.provider.id, model),
      displayName: index === 0 ? input.provider.displayName : `${input.provider.displayName}: ${model}`,
      model,
      preferred: index === 0 && input.defaultProviderId === input.provider.id,
      latencyTier: inferProviderLatencyTier(input.provider.id),
      reasoningDefault: inferProviderReasoningDefault(input.provider.id),
      intendedUse: inferProviderIntendedUse(input.provider.id),
    }));
  }
  return [
    {
      alias: buildProviderAlias(input.provider.id),
      displayName: input.provider.displayName,
      model: configuredModel,
      preferred: input.defaultProviderId === input.provider.id,
      latencyTier: inferProviderLatencyTier(input.provider.id),
      reasoningDefault: inferProviderReasoningDefault(input.provider.id),
      intendedUse: inferProviderIntendedUse(input.provider.id),
    },
  ];
}

export function buildProviderProfile(input: {
  catalog: BinaryProviderCatalogEntry;
  record?: BinaryConnectionRecord | null;
  secret?: BinaryConnectionSecretRecord | null;
  defaultProviderId?: string | null;
}): BinaryProviderProfile {
  const view = input.record ? buildConnectionView(input.record, input.secret) : null;
  return {
    id: input.catalog.id,
    displayName: input.catalog.displayName,
    authStrategy: input.catalog.authStrategy,
    connectionMode: input.catalog.connectionMode,
    oauthCapability: input.catalog.oauthCapability,
    modelCoverageMode: input.catalog.modelCoverageMode,
    runtimeKind: input.catalog.runtimeKind,
    validationKind: input.catalog.validationKind,
    browserConnectUrl: input.catalog.browserConnectUrl,
    browserDocsUrl: input.catalog.browserDocsUrl,
    defaultBaseUrl: input.catalog.defaultBaseUrl,
    defaultModel: input.catalog.defaultModel,
    supportsBrowserAuth:
      input.catalog.connectionMode === "direct_oauth_pkce" ||
      input.catalog.connectionMode === "direct_oauth_device" ||
      input.catalog.connectionMode === "hub_oauth" ||
      input.catalog.connectionMode === "portal_session" ||
      input.catalog.connectionMode === "local_credential_adapter",
    supportsRevocation: input.catalog.supportsRevocation === true,
    supportsDynamicModelCatalog: input.catalog.supportsDynamicModelCatalog === true,
    supportsLocalImport: input.catalog.supportsLocalImport === true,
    ...(input.record?.defaultBaseUrl ? { configuredBaseUrl: input.record.defaultBaseUrl } : {}),
    ...(input.record?.defaultModel ? { configuredModel: input.record.defaultModel } : {}),
    connected: Boolean(input.record && connectionHasRequiredSecret(input.record, input.secret)),
    authReady:
      Boolean(input.record && connectionHasRequiredSecret(input.record, input.secret)) &&
      input.record?.authHealth !== "needs_reauth" &&
      input.record?.authHealth !== "refresh_failed" &&
      input.record?.authHealth !== "expired" &&
      input.record?.authHealth !== "blocked" &&
      input.record?.runtimeReady !== false,
    runtimeReady: input.record?.runtimeReady !== false,
    enabled: input.record?.enabled !== false,
    status: view?.status || "needs_auth",
    ...(input.record?.lastValidatedAt ? { lastValidatedAt: input.record.lastValidatedAt } : {}),
    ...(input.record?.lastAuthError
      ? { lastError: input.record.lastAuthError }
      : input.record?.lastValidationError
        ? { lastError: input.record.lastValidationError }
        : input.catalog.availabilityReason
          ? { lastError: input.catalog.availabilityReason }
          : {}),
    isDefault: String(input.defaultProviderId || "").trim() === input.catalog.id,
    ...(input.record?.id ? { connectionId: input.record.id } : {}),
    hasSecret: Boolean(input.record && connectionHasRequiredSecret(input.record, input.secret)),
    ...(input.catalog.availabilityReason ? { availabilityReason: input.catalog.availabilityReason } : {}),
    ...(input.record?.linkedAccountLabel ? { linkedAccountLabel: input.record.linkedAccountLabel } : {}),
    ...(input.record?.linkedAt ? { linkedAt: input.record.linkedAt } : {}),
    ...(input.record?.lastRefreshedAt ? { lastRefreshedAt: input.record.lastRefreshedAt } : {}),
    ...(input.record?.authHealth ? { authHealth: input.record.authHealth } : {}),
    ...(typeof input.record?.refreshFailureCount === "number" ? { refreshFailureCount: input.record.refreshFailureCount } : {}),
    ...(input.record?.runtimeReadinessReason ? { runtimeReadinessReason: input.record.runtimeReadinessReason } : {}),
    ...(input.record?.routeKind ? { routeKind: input.record.routeKind } : {}),
    ...(input.record?.routeLabel ? { routeLabel: input.record.routeLabel } : {}),
    ...(input.record?.routeReason ? { routeReason: input.record.routeReason } : {}),
    ...(Array.isArray(input.record?.modelFamilies) && input.record.modelFamilies.length
      ? { modelFamilies: [...input.record.modelFamilies] }
      : Array.isArray(input.catalog.modelFamilies) && input.catalog.modelFamilies.length
        ? { modelFamilies: [...input.catalog.modelFamilies] }
        : {}),
    ...(Array.isArray(input.record?.availableModels) && input.record.availableModels.length
      ? { availableModels: [...input.record.availableModels] }
      : {}),
  };
}

export function listProviderProfiles(input: {
  records: BinaryConnectionRecord[];
  secrets: Record<string, BinaryConnectionSecretRecord | null | undefined>;
  defaultProviderId?: string | null;
  includeBeta?: boolean;
}): BinaryProviderProfile[] {
  const recordsByProvider = new Map<BinaryProviderId, BinaryConnectionRecord>();
  for (const record of input.records) {
    const entry = getProviderCatalogEntry(record.providerId);
    if (!entry) continue;
    recordsByProvider.set(entry.id, record);
  }
  return PROVIDER_CATALOG
    .filter((entry) => input.includeBeta || !entry.beta)
    .map((catalog) =>
      buildProviderProfile({
        catalog,
        record: recordsByProvider.get(catalog.id) || null,
        secret: (() => {
          const record = recordsByProvider.get(catalog.id);
          return record ? input.secrets[record.id] : null;
        })(),
        defaultProviderId: input.defaultProviderId,
      })
    );
}

export function buildUserConnectedModelCandidates(input: {
  records: BinaryConnectionRecord[];
  secrets: Record<string, BinaryConnectionSecretRecord | null | undefined>;
  defaultProviderId?: string | null;
}): BinaryUserConnectedModelCandidate[] {
  const candidates: BinaryUserConnectedModelCandidate[] = input.records
    .filter((record) => Boolean(record.providerId))
    .flatMap((record) => {
      const provider = getProviderCatalogEntry(record.providerId);
      const secret = input.secrets[record.id];
      if (
        !provider ||
        record.enabled === false ||
        record.runtimeReady === false ||
        !connectionHasRequiredSecret(record, secret)
      ) {
        return [];
      }
      const credential =
        String(secret?.accessToken || "").trim() ||
        String(secret?.sessionToken || "").trim() ||
        String(secret?.apiKey || "").trim() ||
        String(secret?.bearerToken || "").trim();
      if (!credential) return [];
      const extraHeaders: Record<string, string> = { ...(secret?.secretHeaders || {}) };
      if (provider.id === "gemini" || provider.id === "vertex_ai") {
        const projectHeader = String(secret?.tenantHint || secret?.accountHint || "").trim();
        if (projectHeader) {
          extraHeaders["x-goog-user-project"] = projectHeader;
        }
      }
      const baseUrl = String(record.defaultBaseUrl || provider.defaultBaseUrl).trim() || provider.defaultBaseUrl;
      const modelFamilies =
        Array.isArray(record.modelFamilies) && record.modelFamilies.length
          ? [...record.modelFamilies]
          : Array.isArray(provider.modelFamilies) && provider.modelFamilies.length
            ? [...provider.modelFamilies]
            : undefined;
      return buildProviderCandidateTemplates({
        provider,
        record,
        defaultProviderId: input.defaultProviderId,
      }).map((candidateTemplate) => ({
        alias: candidateTemplate.alias,
        provider: String(provider.id),
        displayName: candidateTemplate.displayName,
        model: candidateTemplate.model,
        baseUrl,
        apiKey: credential,
        ...(record.routeKind ? { routeKind: record.routeKind } : {}),
        ...(record.routeLabel ? { routeLabel: record.routeLabel } : {}),
        ...(record.routeReason ? { routeReason: record.routeReason } : {}),
        ...(modelFamilies ? { modelFamilies: [...modelFamilies] } : {}),
        ...(Object.keys(extraHeaders).length ? { extraHeaders } : {}),
        authSource: "user_connected" as const,
        candidateSource: "user_connected" as const,
        preferred: candidateTemplate.preferred,
        latencyTier: candidateTemplate.latencyTier,
        reasoningDefault: candidateTemplate.reasoningDefault,
        intendedUse: candidateTemplate.intendedUse,
      }));
    });
  return candidates;
}
