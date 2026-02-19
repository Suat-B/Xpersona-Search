import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeHub } from "@/components/home/HomeHub";

/**
 * Home page (/) — marketing for unauthenticated, hub for authenticated.
 * Layout: (marketing) provides HomeMinimalHeader or DashboardChrome based on auth.
 */
export default async function HomePage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // e.g. DB/adapter error
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isAuthenticated = !!(session?.user || userIdFromCookie);

  return (
    <div className="space-y-12 sm:space-y-16">
      {isAuthenticated ? (
        <HomeHub />
      ) : (
        <HomeHero />
      )}
    </div>
  );
}
