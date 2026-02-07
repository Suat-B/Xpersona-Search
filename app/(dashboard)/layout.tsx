import { auth, type Session } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SIDEBAR_LINKS = [
  { href: "/games/dice", label: "Play Dice", exact: true },
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/strategies", label: "Strategies", exact: false },
  { href: "/dashboard/provably-fair", label: "Provably Fair", exact: false },
] as const;

const EXACT_HREFS = ["/games/dice", "/dashboard"];

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
      <aside className="dashboard-sidebar hidden w-64 flex-col border-r border-white/5 bg-bg-card/50 backdrop-blur-md md:flex sticky top-0 h-screen">
        <div className="flex h-16 items-center px-6">
          <Link href="/" className="text-xl font-bold font-[family-name:var(--font-outfit)]">
            xpersona
            <span className="text-accent-heart">.</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-4 py-4">
          {SIDEBAR_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-white transition-colors"
            >
              {label}
            </Link>
          ))}
          <span className="flex items-center rounded-lg px-4 py-2 text-sm font-medium text-text-secondary/50 cursor-not-allowed">
            Transactions
          </span>
          <span className="flex items-center rounded-lg px-4 py-2 text-sm font-medium text-text-secondary/50 cursor-not-allowed">
            Settings
          </span>
        </nav>
        <div className="p-4 border-t border-white/5">
          <div className="text-xs text-text-secondary">
            Logged in as <br />
            <span className="text-white font-medium truncate block">{displayName}</span>
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  function applyActive() {
    var path = window.location.pathname;
    var exact = ${JSON.stringify(EXACT_HREFS)};
    var activeHref = null;
    var links = document.querySelectorAll('.dashboard-sidebar nav a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      var isActive = exact.indexOf(href) >= 0 ? path === href : path === href || path.indexOf(href + '/') === 0;
      if (isActive) { activeHref = href; break; }
    }
    if (activeHref) {
      document.body.setAttribute('data-dashboard-path', path);
      var el = document.getElementById('dashboard-nav-active-style');
      if (el) el.remove();
      var style = document.createElement('style');
      style.id = 'dashboard-nav-active-style';
      style.textContent = 'body[data-dashboard-path] .dashboard-sidebar nav a[href="' + activeHref.replace(/"/g, '\\\\"') + '"] { background: color-mix(in srgb, var(--accent-heart) 10%, transparent); color: var(--accent-heart); }';
      document.head.appendChild(style);
    }
  }
  setTimeout(applyActive, 400);
})();
            `.trim(),
          }}
        />
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-6xl p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
