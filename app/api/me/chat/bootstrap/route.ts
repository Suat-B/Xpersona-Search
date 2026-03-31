import { NextRequest, NextResponse } from "next/server";
import {
  applyChatActorCookie,
  createAnonymousChatActor,
  ensureChatTrialEntitlement,
  resolveExistingChatActor,
} from "@/lib/chat/actor";
import { checkChatBootstrapRateLimit } from "@/lib/chat/bootstrap-rate-limit";
import { DEFAULT_PLAYGROUND_MODEL_ALIAS } from "@/lib/playground/model-registry";
import {
  getBrowserAuthAvailability,
  getPlaygroundByomPreferences,
  listUserConnectedModels,
} from "@/lib/playground/byom";
import { getUserPlaygroundProfile } from "@/lib/playground/store";

async function buildModelSettings(userId: string) {
  const profile = await getUserPlaygroundProfile({ userId }).catch(() => null);
  const preferences = getPlaygroundByomPreferences(profile);
  const connections = await listUserConnectedModels({ userId }).catch(() => []);
  return {
    platformDefaultModelAlias: DEFAULT_PLAYGROUND_MODEL_ALIAS,
    browserAuth: getBrowserAuthAvailability(),
    preferredModelAlias: profile?.preferredModelAlias ?? null,
    preferredChatModelSource: preferences.preferredChatModelSource,
    fallbackToPlatformModel: preferences.fallbackToPlatformModel,
    connections,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const existing = await resolveExistingChatActor(request);
    if (existing) {
      const trial = await ensureChatTrialEntitlement(existing.userId);
      const modelSettings = await buildModelSettings(existing.userId);
      const response = NextResponse.json({
        success: true,
        data: {
          ready: true,
          viewer: {
            userId: existing.userId,
            email: existing.email,
            isAnonymous: existing.isAnonymous,
            accountType: existing.accountType,
            source: existing.source,
          },
          trial,
          modelSettings,
        },
      });
      applyChatActorCookie(response, existing);
      return response;
    }

    const rl = await checkChatBootstrapRateLimit(request);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "RATE_LIMITED",
          message: "Too many bootstrap attempts. Please try again shortly.",
          retryAfter: rl.retryAfter ?? 60,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfter ?? 60),
          },
        }
      );
    }

    const actor = await createAnonymousChatActor();
    const trial = await ensureChatTrialEntitlement(actor.userId);
    const modelSettings = await buildModelSettings(actor.userId);
    const response = NextResponse.json({
      success: true,
      data: {
        ready: true,
        viewer: {
          userId: actor.userId,
          email: actor.email,
          isAnonymous: actor.isAnonymous,
          accountType: actor.accountType,
          source: actor.source,
        },
        trial,
        modelSettings,
      },
    });
    applyChatActorCookie(response, actor);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap failed";
    return NextResponse.json(
      {
        success: false,
        error: "BOOTSTRAP_FAILED",
        message,
      },
      { status: 500 }
    );
  }
}
