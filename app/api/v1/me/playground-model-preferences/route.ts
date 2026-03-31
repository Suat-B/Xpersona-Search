import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getPlaygroundByomPreferences, updateStablePreferencesWithByom } from "@/lib/playground/byom";
import { getUserPlaygroundProfile, upsertUserPlaygroundProfile } from "@/lib/playground/store";

export async function GET(request: NextRequest) {
  const auth = await getAuthUser(request);
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  const profile = await getUserPlaygroundProfile({ userId: auth.user.id }).catch(() => null);
  const preferences = getPlaygroundByomPreferences(profile);
  return NextResponse.json({
    success: true,
    data: {
      preferredModelAlias: profile?.preferredModelAlias ?? null,
      ...preferences,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser(request);
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ success: false, message: "Request body is required." }, { status: 400 });
  }

  const profile = await getUserPlaygroundProfile({ userId: auth.user.id }).catch(() => null);
  const nextStablePreferences = updateStablePreferencesWithByom({
    existing: profile?.stablePreferences ?? null,
    byom: {
      preferredChatModelSource:
        body.preferredChatModelSource === "user_connected" ? "user_connected" : "platform",
      fallbackToPlatformModel:
        body.fallbackToPlatformModel === undefined ? undefined : body.fallbackToPlatformModel !== false,
    },
  });

  const nextProfile = await upsertUserPlaygroundProfile({
    userId: auth.user.id,
    preferredModelAlias:
      body.preferredModelAlias === null
        ? null
        : typeof body.preferredModelAlias === "string"
          ? body.preferredModelAlias.trim() || null
          : profile?.preferredModelAlias ?? null,
    stablePreferences: nextStablePreferences,
  });
  const preferences = getPlaygroundByomPreferences(nextProfile);
  return NextResponse.json({
    success: true,
    data: {
      preferredModelAlias: nextProfile.preferredModelAlias,
      ...preferences,
    },
  });
}
