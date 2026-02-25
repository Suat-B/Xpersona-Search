import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";
import { GraphExplorer } from "@/components/graph/GraphExplorer";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // Ignore auth errors for public page rendering.
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isAuthenticated = !!(session?.user || userIdFromCookie);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-deep)]">
      <ANSMinimalHeader isAuthenticated={isAuthenticated} variant="dark" />

      <main className="flex-1">
        <GraphExplorer />
      </main>

      <ANSMinimalFooter variant="dark" />
    </div>
  );
}
