import { auth, type Session } from "@/lib/auth";
import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { EnsureGuest } from "@/components/auth/EnsureGuest";
import { DashboardSidebarNav } from "@/components/layout/DashboardSidebarNav";
import { MobileDashboardNav } from "@/components/layout/MobileDashboardNav";
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
      displayName = u?.name ?? u?.email ?? "Guest";
      isAdmin = isAdminEmail(u?.email);
    } catch {
      displayName = "Guest";
    }
  }

  return (
    <div className="flex min-h-screen bg-black">
      {needsGuest && <EnsureGuest needsGuest={true} />}

      {/* Mobile top bar + drawer nav */}
      <MobileDashboardNav displayName={displayName} isAdmin={isAdmin} />
      
      {/* Sidebar - Apple Style (hidden on mobile) */}
      <aside className="dashboard-sidebar hidden w-[280px] min-w-[280px] flex-col md:flex sticky top-0 h-screen border-r border-[var(--border)] overflow-x-hidden">
        {/* Glassmorphism background */}
        <div className="absolute inset-0 bg-[var(--bg-matte)]/80 backdrop-blur-xl" />
        
        <div className="relative flex h-full flex-col">
          {/* Logo Section */}
          <div className="flex h-20 items-center px-6 border-b border-[var(--border)]">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-heart)] to-[var(--accent-purple)] shadow-lg shadow-[var(--accent-heart)]/20 group-hover:shadow-[var(--accent-heart)]/40 transition-shadow">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                  xpersona
                </span>
                <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  AI-First Casino
                </span>
              </div>
            </Link>
          </div>
          
          {/* Navigation */}
          <DashboardSidebarNav isAdmin={isAdmin} />
          
          {/* User Section */}
          <div className="p-4 border-t border-[var(--border)]">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-[var(--border)]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)]">
                <span className="text-sm font-semibold text-white">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-xs text-[var(--text-tertiary)] truncate">
                  Logged in as {displayName}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-7xl p-6 md:p-8 space-y-6">
          <AIFirstBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
