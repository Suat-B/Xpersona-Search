import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { EnsureGuest } from "@/components/auth/EnsureGuest";

/** Full-viewport layout for games — entire screen (no scroll), immersive trading terminal. */
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
    <div className="fixed inset-0 z-[100] h-screen w-screen overflow-hidden flex flex-col bg-[#000000]">
      <div className="absolute inset-0 dot-grid opacity-[0.02] pointer-events-none" aria-hidden />
      {needsGuest && <EnsureGuest needsGuest={true} />}
      {children}
    </div>
  );
}
