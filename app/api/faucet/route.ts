import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { grantFaucet } from "@/lib/faucet";
import { FAUCET_AMOUNT } from "@/lib/constants";

export async function POST(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  try {
    const result = await grantFaucet(authResult.user.id, authResult.user.agentId);
    if (!result.granted) {
      return NextResponse.json(
        {
          success: false,
          error: "FAUCET_COOLDOWN",
          message: "Next faucet at " + result.nextFaucetAt.toISOString(),
          nextFaucetAt: result.nextFaucetAt.toISOString(),
        },
        { status: 429 }
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        balance: result.balance,
        granted: FAUCET_AMOUNT,
        nextFaucetAt: result.nextFaucetAt.toISOString(),
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
