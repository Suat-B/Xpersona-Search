import { auth, type Session } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { cn } from "@/lib/utils";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-white/5 bg-bg-card/50 backdrop-blur-md md:flex sticky top-0 h-screen">
        <div className="flex h-16 items-center px-6">
          <Link href="/" className="text-xl font-bold font-[family-name:var(--font-outfit)]">
            xpersona
            <span className="text-accent-heart">.</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-4 py-4">
          <NavItem href="/dashboard" active>Dashboard</NavItem>
          <NavItem href="/dashboard#strategies">Strategies</NavItem>
          <NavItem href="/transactions" disabled>Transactions</NavItem>
          <NavItem href="/settings" disabled>Settings</NavItem>
        </nav>
        <div className="p-4 border-t border-white/5">
          <div className="text-xs text-text-secondary">
            Logged in as <br />
            <span className="text-white font-medium truncate block">{displayName}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-6xl p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, children, active, disabled }: { href: string; children: React.ReactNode; active?: boolean; disabled?: boolean }) {
    if (disabled) {
        return (
            <span className="flex items-center rounded-lg px-4 py-2 text-sm font-medium text-text-secondary/50 cursor-not-allowed">
                {children}
            </span>
        )
    }
    return (
        <Link
            href={href}
            className={cn(
                "flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                active
                    ? "bg-accent-heart/10 text-accent-heart"
                    : "text-text-secondary hover:bg-white/5 hover:text-white"
            )}
        >
            {children}
        </Link>
    );
}
