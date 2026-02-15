import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { createRecoveryToken } from "@/lib/auth-utils";

function getBaseUrl(request: NextRequest): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return process.env.NEXTAUTH_URL ?? "https://xpersona.co";
  }
}

/**
 * POST /api/me/recovery-link
 * Generate a recovery link the user can save. If they lose their session/cookie,
 * visiting this link restores their access. Link expires in 7 days.
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error, recovery_url: "https://xpersona.co" },
      { status: 401 }
    );
  }

  const token = createRecoveryToken(authResult.user.id);
  const baseUrl = getBaseUrl(request);
  const url = `${baseUrl}/api/auth/recover?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    success: true,
    data: {
      url,
      expiresInDays: 7,
      message: "Save this link. If you lose your session, open it to restore access.",
    },
  });
}
