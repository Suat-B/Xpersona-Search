import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { economyError } from "@/lib/economy/http";
import { createOnboardingLink, createOrGetConnectAccount } from "@/lib/economy/payments";

export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }

  try {
    const accountId = await createOrGetConnectAccount(authResult.user.id);
    const link = await createOnboardingLink(accountId, authResult.user.id);
    return NextResponse.json({ success: true, data: { accountId, onboardingUrl: link.url } });
  } catch (err) {
    return economyError(err, "CONNECT_ONBOARD_FAILED");
  }
}