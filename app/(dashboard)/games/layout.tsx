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
    <div className="fixed inset-0 z-[100] h-dvh w-screen overflow-hidden flex flex-col bg-[#000000]">
      {/* Ambient mesh background with floating orbs */}
      <div className="ambient-mesh" aria-hidden>
        <div className="ambient-mesh-orb ambient-mesh-orb-1 bg-[#0ea5e9]/[0.03]" />
        <div className="ambient-mesh-orb ambient-mesh-orb-2 bg-[#5e5ce6]/[0.025]" />
        <div className="ambient-mesh-orb ambient-mesh-orb-3 bg-[#30d158]/[0.02]" />
      </div>
      {/* Subtle dot grid overlay */}
      <div className="absolute inset-0 dot-grid-animated opacity-[0.015] pointer-events-none" aria-hidden />
      {needsGuest && <EnsureGuest needsGuest={true} />}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative z-10">
        {children}
      </div>
    </div>
  );
}
