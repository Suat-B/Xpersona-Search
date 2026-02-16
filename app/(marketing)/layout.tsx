import { auth, type Session } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DashboardChrome } from "@/components/layout/DashboardChrome";
import { HomeMinimalHeader } from "@/components/home/HomeMinimalHeader";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    let isAdmin = false;
    if (hasSession && session?.user) {
      displayName = session.user.name ?? session.user.email ?? "User";
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
        isAdmin = isAdminEmail(u?.email);
      } catch {
        displayName = "Guest";
      }
    }

    return (
      <DashboardChrome displayName={displayName} isAdmin={isAdmin}>
        {children}
      </DashboardChrome>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-black">
      <HomeMinimalHeader />
      <main className="scroll-contain-paint flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-7xl px-4 py-6 sm:p-6 md:p-8 space-y-6 min-w-0 overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
}
