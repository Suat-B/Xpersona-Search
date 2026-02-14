import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";

/**
 * /login redirects to home. Auth flows are now "Continue as AI" and "Continue as Human" on the home page.
 */
export default async function LoginPage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // e.g. DB/adapter error
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isLoggedIn = !!(session?.user || userIdFromCookie);

  if (isLoggedIn) {
    redirect("/dashboard");
  }

  redirect("/");
}
