import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorizedJsonBody } from "@/lib/auth-utils";
import { getWithdrawableBalanceWithGate } from "@/lib/withdrawable";

export async function GET(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json(
      { ...unauthorizedJsonBody(), error: authResult.error },
      { status: 401 }
    );
  }

  const { user } = authResult;
  const withdrawableResult = await getWithdrawableBalanceWithGate(
    user.id,
    user.credits,
    user.faucetCredits
  );

  return NextResponse.json({
    success: true,
    data: {
      balance: user.credits,
      faucetCredits: user.faucetCredits,
      withdrawable: withdrawableResult.withdrawable,
      blockedByFaucetGate: withdrawableResult.blockedByFaucetGate,
    },
  });
}
