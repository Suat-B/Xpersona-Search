import { auth, type Session } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";

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

  if (!hasSession && !hasGuest) {
    redirect("/");
  }

  let displayName = "User";
  if (hasSession && session?.user) {
    displayName = session.user.name ?? session.user.email ?? "User";
  } else if (hasGuest && userIdFromCookie) {
    try {
      const [u] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, userIdFromCookie))
        .limit(1);
      displayName = u?.name ?? u?.email ?? "Guest";
    } catch {
      displayName = "Guest";
    }
  }

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar displayName={displayName} />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-6xl p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
