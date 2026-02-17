import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { DepositPageClient } from "./DepositPageClient";

async function getBalanceForUser(): Promise<number | null> {
  try {
    const session = await auth();
    if (session?.user?.id) {
      const [u] = await db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);
      return u ? Number(u.credits) : null;
    }
    const cookieStore = await cookies();
    const userId = getAuthUserFromCookie(cookieStore);
    if (userId) {
      const [u] = await db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return u ? Number(u.credits) : null;
    }
  } catch {
    // ignore
  }
  return null;
}

export default async function DepositPage() {
  const serverBalance = await getBalanceForUser();

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
      <DepositPageClient initialBalance={serverBalance} />
    </Suspense>
  );
}
