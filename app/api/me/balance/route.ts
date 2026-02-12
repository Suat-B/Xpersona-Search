import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getWithdrawableBalance } from "@/lib/withdrawable";

export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const { credits, faucetCredits } = authResult.user;
  const withdrawable = getWithdrawableBalance(credits, faucetCredits ?? 0);
  return NextResponse.json({
    success: true,
    data: {
      balance: credits,
      faucetCredits: faucetCredits ?? 0,
      withdrawable,
    },
  });
}
