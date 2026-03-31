import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import {
  buildProviderAlias,
  buildProviderSecret,
  getBrowserAuthAvailability,
  getPlaygroundByomPreferences,
  listUserConnectedModels,
  updateStablePreferencesWithByom,
  validateOpenAiApiKey,
} from "@/lib/playground/byom";
import {
  getUserPlaygroundProfile,
  upsertPlaygroundProviderConnection,
  upsertUserPlaygroundProfile,
} from "@/lib/playground/store";
import { DEFAULT_PLAYGROUND_MODEL_ALIAS } from "@/lib/playground/model-registry";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function GET(request: NextRequest) {
  const auth = await getAuthUser(request);
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  const profile = await getUserPlaygroundProfile({ userId: auth.user.id }).catch(() => null);
  const preferences = getPlaygroundByomPreferences(profile);
  const connections = await listUserConnectedModels({ userId: auth.user.id });

  return NextResponse.json({
    success: true,
    data: {
      platformDefaultModelAlias: DEFAULT_PLAYGROUND_MODEL_ALIAS,
      browserAuth: getBrowserAuthAvailability(),
      preferences: {
        preferredChatModelSource: preferences.preferredChatModelSource,
        fallbackToPlatformModel: preferences.fallbackToPlatformModel,
        preferredModelAlias: profile?.preferredModelAlias ?? null,
      },
      connections,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser(request);
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return badRequest("Request body is required.");

  const provider = String(body.provider || "").trim().toLowerCase();
  const authMode = String(body.authMode || "api_key").trim().toLowerCase();
  if (provider !== "openai") {
    return badRequest("Only OpenAI is supported for the first BYOM connection flow.");
  }

  if (authMode === "browser_auth") {
    const browserAuth = getBrowserAuthAvailability();
    return badRequest(browserAuth.reason, 501);
  }
  if (authMode !== "api_key") {
    return badRequest("Unsupported provider auth mode.");
  }

  const apiKey = String(body.apiKey || "").trim();
  const baseUrl = String(body.baseUrl || "").trim() || undefined;
  const defaultModel = String(body.defaultModel || "").trim() || undefined;
  const displayName = String(body.displayName || "").trim() || "Your OpenAI model";
  if (!apiKey) return badRequest("API key is required.");

  const validation = await validateOpenAiApiKey({ apiKey, baseUrl, defaultModel }).catch((error) => ({
    ok: false as const,
    message: error instanceof Error ? error.message : "Provider validation failed.",
  }));
  if (!validation.ok) {
    return badRequest(validation.message);
  }

  const alias = buildProviderAlias(provider);
  const connection = await upsertPlaygroundProviderConnection({
    userId: auth.user.id,
    provider,
    alias,
    displayName,
    authMode: "api_key",
    secretEncrypted: buildProviderSecret({ authMode: "api_key", apiKey }),
    baseUrl: validation.baseUrl,
    defaultModel: validation.defaultModel,
    status: "active",
    lastValidatedAt: new Date(),
    lastValidationError: null,
    metadata: {
      availableModelsPreview: validation.availableModels.slice(0, 24),
      connectedAt: new Date().toISOString(),
    },
  });

  const makeDefault = body.makeDefault !== false;
  if (makeDefault) {
    const profile = await getUserPlaygroundProfile({ userId: auth.user.id }).catch(() => null);
    await upsertUserPlaygroundProfile({
      userId: auth.user.id,
      preferredModelAlias: alias,
      stablePreferences: updateStablePreferencesWithByom({
        existing: profile?.stablePreferences ?? null,
        byom: {
          preferredChatModelSource: "user_connected",
          fallbackToPlatformModel: true,
        },
      }),
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      connection: {
        id: connection.id,
        provider: connection.provider,
        alias: connection.alias,
        displayName: connection.displayName,
        authMode: connection.authMode,
        baseUrl: connection.baseUrl,
        defaultModel: connection.defaultModel,
        status: connection.status,
        lastValidatedAt: connection.lastValidatedAt?.toISOString() ?? null,
        lastValidationError: connection.lastValidationError,
        browserAuthSupported: getBrowserAuthAvailability().enabled,
      },
      validation: {
        availableModels: validation.availableModels,
      },
    },
  });
}
