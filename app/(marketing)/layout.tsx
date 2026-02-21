import { redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getService } from "@/lib/service";
import { GameChrome } from "@/components/layout/GameChrome";
import { TradingChrome } from "@/components/layout/TradingChrome";
import { HomeMinimalHeader } from "@/components/home/HomeMinimalHeader";
import { TradingMinimalHeader } from "@/components/layout/TradingMinimalHeader";
import { HubMinimalHeader } from "@/components/layout/HubMinimalHeader";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const service = await getService();
  let session: Session | null = null;
  try {
    session = await auth();
  } catch (err) {
    console.error("[marketing layout] auth() error:", err);
  }

  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const hasSession = !!session?.user;
  const hasGuest = !!userIdFromCookie;

  if (hasSession || hasGuest) {
    let displayName = "User";
    let userEmail: string | null = null;
    let isAdmin = false;
    let isPermanent = false;
    if (hasSession && session?.user?.id) {
      try {
        const [u] = await db
          .select({ name: users.name, email: users.email, accountType: users.accountType, passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.id, session.user.id))
          .limit(1);
        const isAgent = u?.email?.endsWith?.("@xpersona.agent") ?? false;
        displayName = isAgent ? "AI" : (u?.name ?? u?.email ?? "User");
        userEmail = u?.email ?? null;
        isAdmin = isAdminEmail(u?.email);
        isPermanent = u?.accountType === "email" || !!u?.passwordHash;
      } catch {
        displayName = session.user.name ?? session.user.email ?? "User";
        userEmail = session.user.email ?? null;
        isAdmin = isAdminEmail(session.user.email);
      }
    } else if (hasGuest && userIdFromCookie) {
      try {
        const [u] = await db
          .select({ name: users.name, email: users.email, accountType: users.accountType, passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.id, userIdFromCookie))
          .limit(1);
        const isAgent = u?.email?.endsWith?.("@xpersona.agent") ?? false;
        displayName = isAgent ? "AI" : (u?.name ?? u?.email ?? "Guest");
        userEmail = u?.email ?? null;
        isAdmin = isAdminEmail(u?.email);
        isPermanent = u?.accountType === "email" || !!u?.passwordHash;
      } catch {
        displayName = "Guest";
      }
    }

    if (service === "hub") {
      redirect("/dashboard");
    }
    if (service === "game") {
      return (
        <GameChrome displayName={displayName} userEmail={userEmail} isAdmin={isAdmin} isPermanent={isPermanent}>
          {children}
        </GameChrome>
      );
    }
    if (service === "trading") {
      return (
        <TradingChrome displayName={displayName} userEmail={userEmail} isAdmin={isAdmin} isPermanent={isPermanent}>
          {children}
        </TradingChrome>
      );
    }
    return (
      <GameChrome displayName={displayName} userEmail={userEmail} isAdmin={isAdmin} isPermanent={isPermanent}>
        {children}
      </GameChrome>
    );
  }

  const MinimalHeader = service === "hub" ? HubMinimalHeader : service === "trading" ? TradingMinimalHeader : HomeMinimalHeader;

  return (
    <div className="flex min-h-screen w-full bg-black">
      <MinimalHeader />
      <main className="scroll-contain-paint flex-1 overflow-y-auto">
        <div className="w-full max-w-7xl mx-auto px-4 py-6 sm:p-6 md:p-8 space-y-6 min-w-0">{children}</div>
      </main>
    </div>
  );
}
