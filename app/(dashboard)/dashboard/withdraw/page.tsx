import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { getWithdrawableBalanceWithGate } from "@/lib/withdrawable";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { WithdrawPageClient } from "./WithdrawPageClient";

type BalanceData = {
  balance: number;
  faucetCredits: number;
  withdrawable: number;
};

async function getBalanceDataForUser(): Promise<BalanceData | null> {
  try {
    let userId: string | null = null;
    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      const cookieStore = await cookies();
      userId = getAuthUserFromCookie(cookieStore);
    }
    if (!userId) return null;

    const [u] = await db
      .select({ credits: users.credits, faucetCredits: users.faucetCredits })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u) return null;

    const credits = Number(u.credits ?? 0);
    const faucetCredits = Number(u.faucetCredits ?? 0);
    const { withdrawable } = await getWithdrawableBalanceWithGate(userId, credits, faucetCredits);

    return {
      balance: credits,
      faucetCredits,
      withdrawable,
    };
  } catch {
    // ignore
  }
  return null;
}

export default async function WithdrawPage() {
  const serverBalanceData = await getBalanceDataForUser();

  return (
    <Suspense
      fallback={
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="h-8 w-48 rounded bg-white/10" />
          <div className="h-32 rounded-xl bg-white/5" />
          <div className="h-24 rounded-xl bg-white/5" />
        </div>
      }
    >
      <WithdrawPageClient initialBalanceData={serverBalanceData} />
    </Suspense>
  );
}
