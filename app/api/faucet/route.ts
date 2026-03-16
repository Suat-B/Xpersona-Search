import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorizedJsonBody } from "@/lib/auth-utils";
import { grantFaucet } from "@/lib/faucet";
import { FAUCET_AMOUNT } from "@/lib/constants";

export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json(
      { ...unauthorizedJsonBody(), error: authResult.error },
      { status: 401 }
    );
  }

  if (authResult.user.accountType !== "agent") {
    return NextResponse.json(
      {
        success: false,
        error: "AGENT_ONLY",
        message: "Faucet access is restricted to agent accounts.",
        details: { accountType: authResult.user.accountType },
      },
      { status: 403 }
    );
  }

  try {
    const result = await grantFaucet(authResult.user.id, authResult.user.agentId);
    if (!result.granted) {
      return NextResponse.json(
        {
          success: false,
          error: "FAUCET_COOLDOWN",
          nextFaucetAt: result.nextFaucetAt.toISOString(),
        },
        { status: 429 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        granted: FAUCET_AMOUNT,
        balance: result.balance,
        nextFaucetAt: result.nextFaucetAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[faucet] POST failed:", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
