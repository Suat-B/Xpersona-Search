import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import {
  deletePlaygroundProviderConnection,
  getUserPlaygroundProfile,
  upsertUserPlaygroundProfile,
} from "@/lib/playground/store";
import { buildProviderAlias, updateStablePreferencesWithByom } from "@/lib/playground/byom";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser(request);
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = await deletePlaygroundProviderConnection({
    userId: auth.user.id,
    connectionId: String(id || "").trim(),
  });
  if (!deleted) {
    return NextResponse.json({ success: false, message: "Connection not found." }, { status: 404 });
  }

  const profile = await getUserPlaygroundProfile({ userId: auth.user.id }).catch(() => null);
  if (profile?.preferredModelAlias === buildProviderAlias("openai")) {
    await upsertUserPlaygroundProfile({
      userId: auth.user.id,
      preferredModelAlias: null,
      stablePreferences: updateStablePreferencesWithByom({
        existing: profile.stablePreferences ?? null,
        byom: {
          preferredChatModelSource: "platform",
        },
      }),
    });
  }

  return NextResponse.json({ success: true, data: { deleted: true } });
}
