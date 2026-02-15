import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { EnsureGuest } from "@/components/auth/EnsureGuest";

/** Full-viewport layout for Pure Dice — entire screen (1920×1080) */
export default async function GamesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = null;
  try {
    session = await auth();
  } catch (err) {
    console.error("[games layout] auth() error:", err);
  }

  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const hasSession = !!session?.user;
  const hasGuest = !!userIdFromCookie;
  const needsGuest = !hasSession && !hasGuest;

  return (
    <div className="fixed inset-0 z-[100] h-screen w-screen bg-[var(--bg-deep)] overflow-hidden flex flex-col">
      {needsGuest && <EnsureGuest needsGuest={true} />}
      {children}
    </div>
  );
}
