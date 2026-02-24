/**
 * Post-sign-in redirect logic per XPERSONA ANS.MD Section 2.3.
 * Ensures users land on the appropriate dashboard (Game vs Trading) based on
 * sign-in context.
 */

import type { Service } from "@/lib/subdomain";

/** Auth routes that should never be used as callbackUrl. */
const AUTH_ROUTES = [
  "/auth/signin",
  "/auth/signup",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth-error",
];

/**
 * Check if a path is a valid callback target (same-origin, not auth route).
 */
function isValidCallbackPath(path: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return !AUTH_ROUTES.some(
    (r) => normalized === r || normalized.startsWith(`${r}/`)
  );
}

/**
 * Parse callback into path + query (always internal path).
 */
function parseCallbackTarget(
  callbackUrl: string
): { pathname: string; pathWithQuery: string } | null {
  const trimmed = callbackUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) {
    const [pathname] = trimmed.split("?");
    return {
      pathname: pathname || "/",
      pathWithQuery: trimmed,
    };
  }

  try {
    const parsed = new URL(trimmed);
    return {
      pathname: parsed.pathname || "/",
      pathWithQuery: `${parsed.pathname || "/"}${parsed.search}`,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve post-sign-in redirect path.
 *
 * Order of precedence:
 * 1. Valid callbackUrl provided -> use it (preserve query)
 * 2. link=agent or link=guest -> /dashboard/profile (link flow fallback)
 * 3. Trading service -> /trading (marketplace as root)
 * 4. Hub or Game -> /dashboard (Game dashboard)
 *
 * @param service - Current service (hub, game, trading)
 * @param callbackUrl - Optional callback from query params
 * @param link - Optional "agent" or "guest" for link flow
 */
export function getPostSignInRedirectPath(
  service: Service,
  callbackUrl: string | null | undefined,
  link?: string | null
): string {
  if (callbackUrl) {
    const parsed = parseCallbackTarget(callbackUrl);
    if (parsed && isValidCallbackPath(parsed.pathname)) {
      return parsed.pathWithQuery;
    }
  }

  if (link === "agent" || link === "guest") {
    return "/dashboard/profile";
  }

  if (service === "trading") {
    return "/trading";
  }

  return "/dashboard";
}
