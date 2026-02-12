import { auth, type Session } from "@/lib/auth";
import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { EnsureGuest } from "@/components/auth/EnsureGuest";
import { DashboardSidebarNav } from "@/components/layout/DashboardSidebarNav";
import { AIFirstBanner } from "@/components/ui/AIFirstBanner";

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
      {needsGuest && <EnsureGuest needsGuest={true} />}
      <aside className="dashboard-sidebar hidden w-64 flex-col border-r border-white/5 bg-bg-card/50 backdrop-blur-md md:flex sticky top-0 h-screen">
        <div className="flex h-16 items-center px-6 flex-col justify-center gap-0.5">
          <Link href="/" className="text-xl font-bold font-[family-name:var(--font-outfit)]">
            xpersona
            <span className="text-accent-heart">.</span>
          </Link>
          <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">AI-First Casino</span>
        </div>
        <DashboardSidebarNav />
        <div className="p-4 border-t border-white/5">
          <div className="text-xs text-[var(--text-secondary)]">
            Logged in as <br />
            <span className="text-white font-medium truncate block">{displayName}</span>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-6xl p-6 md:p-8 space-y-4">
          <AIFirstBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
