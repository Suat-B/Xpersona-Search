import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { EnsureGuest } from "@/components/auth/EnsureGuest";

/** Games layout — renders within dashboard chrome with sidebar. */
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
    <>
      {needsGuest && <EnsureGuest needsGuest={true} />}
      {children}
    </>
  );
}
