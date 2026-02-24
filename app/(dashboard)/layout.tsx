import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getService } from "@/lib/service";
import { EnsureGuest } from "@/components/auth/EnsureGuest";
import { GameChrome } from "@/components/layout/GameChrome";
import { TradingChrome } from "@/components/layout/TradingChrome";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const service = await getService();
  let session: Session | null = null;
  try {
    session = await auth();
  } catch (err) {
    console.error("[dashboard layout] auth() error:", err);
  }

  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const hasSession = !!session?.user;
  const hasGuest = !!userIdFromCookie;
  const needsGuest = !hasSession && !hasGuest;

  let displayName = needsGuest ? "Guest" : "User";
  let userEmail: string | null = null;
  let isAdmin = false;
  let isPermanent = false;
  let accountType: string | null = null;
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
      accountType = u?.accountType ?? null;
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
      accountType = u?.accountType ?? null;
      isAdmin = isAdminEmail(u?.email);
      isPermanent = u?.accountType === "email" || !!u?.passwordHash;
    } catch {
      displayName = "Guest";
    }
  }

  const Chrome = service === "trading" ? TradingChrome : GameChrome;

  return (
    <>
      {needsGuest && <EnsureGuest needsGuest={true} />}
      <Chrome
        displayName={displayName}
        userEmail={userEmail}
        isAdmin={isAdmin}
        isPermanent={isPermanent}
        accountType={accountType}
      >
        {children}
      </Chrome>
    </>
  );
}
