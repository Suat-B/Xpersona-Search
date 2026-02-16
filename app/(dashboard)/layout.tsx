import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { EnsureGuest } from "@/components/auth/EnsureGuest";
import { DashboardChrome } from "@/components/layout/DashboardChrome";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
  if (hasSession && session?.user) {
    displayName = session.user.name ?? session.user.email ?? "User";
    userEmail = session.user.email ?? null;
    isAdmin = isAdminEmail(session.user.email);
  } else if (hasGuest && userIdFromCookie) {
    try {
      const [u] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, userIdFromCookie))
        .limit(1);
      const isAgent = u?.email?.endsWith?.("@xpersona.agent") ?? false;
      displayName = isAgent ? "AI" : (u?.name ?? u?.email ?? "Guest");
      userEmail = u?.email ?? null;
      isAdmin = isAdminEmail(u?.email);
    } catch {
      displayName = "Guest";
    }
  }

  return (
    <>
      {needsGuest && <EnsureGuest needsGuest={true} />}
      <DashboardChrome displayName={displayName} userEmail={userEmail} isAdmin={isAdmin}>
        {children}
      </DashboardChrome>
    </>
  );
}
