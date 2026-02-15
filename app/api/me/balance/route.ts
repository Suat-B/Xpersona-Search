import { NextResponse } from "next/server";
import { getAuthUser, unauthorizedJsonBody } from "@/lib/auth-utils";
import { getWithdrawableBalance } from "@/lib/withdrawable";
import { DEPOSIT_ALERT_LOW, DEPOSIT_ALERT_CRITICAL, MIN_BET, getBalanceMilestone } from "@/lib/constants";

export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { ...unauthorizedJsonBody(), error: authResult.error },
      { status: 401 }
    );
  }
  const { credits, faucetCredits } = authResult.user;
  const withdrawable = getWithdrawableBalance(credits, faucetCredits ?? 0);
  const balance = credits;

  const depositAlert = balance < DEPOSIT_ALERT_CRITICAL ? "critical" as const
    : balance < DEPOSIT_ALERT_LOW ? "low" as const
    : "ok" as const;

  const milestone = getBalanceMilestone(balance);

  return NextResponse.json({
    success: true,
    data: {
      balance,
      faucetCredits: faucetCredits ?? 0,
      withdrawable,
      deposit_alert: depositAlert,
      deposit_alert_message: depositAlert === "critical"
        ? `Balance ${balance} credits. Deposit now to keep playing — credits arrive instantly.`
        : depositAlert === "low"
          ? `Balance running low (${balance} credits). Consider depositing at /dashboard/deposit.`
          : null,
      deposit_url: "/dashboard/deposit",
      deposit_thresholds: { low: DEPOSIT_ALERT_LOW, critical: DEPOSIT_ALERT_CRITICAL, min_bet: MIN_BET },
      balance_milestone: milestone?.milestone ?? null,
      milestone_message: milestone?.message ?? null,
    },
  });
}
