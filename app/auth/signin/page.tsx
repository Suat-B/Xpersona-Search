import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { getService } from "@/lib/service";
import { getPostSignInRedirectPath } from "@/lib/post-sign-in-redirect";
import { SignInForm } from "@/components/auth/SignInForm";

type SearchParams = Record<string, string | string[] | undefined>;

function readStringParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const callbackUrl = readStringParam(resolvedSearchParams, "callbackUrl");
  const link = readStringParam(resolvedSearchParams, "link");

  let session = null;
  try {
    session = await auth();
  } catch {
    // Fallback to cookie-based auth below
  }

  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isAuthenticated = !!(session?.user || userIdFromCookie);

  if (isAuthenticated) {
    const service = await getService();
    const redirectPath = getPostSignInRedirectPath(service, callbackUrl, link);
    redirect(redirectPath);
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)]">
          <div className="h-8 w-8 rounded-full border-2 border-[var(--accent-heart)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
