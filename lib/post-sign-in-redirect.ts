/**
 * Post-sign-in redirect logic per XPERSONA ANS.MD Section 2.3.
 * Ensures users land on the appropriate dashboard (Game vs Trading) based on
 * sign-in context.
 */

import type { Service } from "@/lib/subdomain";

/** Auth routes that should never be used as callbackUrl. */
const AUTH_ROUTES = ["/auth/signin", "/auth/signup", "/auth/forgot-password", "/auth/reset-password", "/auth-error"];

/**
 * Check if a path is a valid callback target (same-origin, not auth route).
 */
function isValidCallbackPath(path: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const withoutQuery = normalized.split("?")[0];
  return !AUTH_ROUTES.some((r) => withoutQuery === r || withoutQuery.startsWith(`${r}/`));
}

/**
 * Resolve post-sign-in redirect path.
 *
 * Order of precedence:
 * 1. link=agent or link=guest → /dashboard/profile (link flow)
 * 2. Valid callbackUrl provided → use it
 * 3. Trading service → /trading (marketplace as root)
 * 4. Hub or Game → /dashboard (Game dashboard)
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
  if (link === "agent" || link === "guest") {
    return "/dashboard/profile";
  }

  if (callbackUrl) {
    let path: string;
    if (callbackUrl.startsWith("/")) {
      path = callbackUrl.split("?")[0] || "/";
    } else {
      try {
        const parsed = new URL(callbackUrl, "https://example.com");
        path = parsed.pathname || "/";
      } catch {
        path = "/";
      }
    }
    if (path && isValidCallbackPath(path)) {
      return path;
    }
  }

  if (service === "trading") {
    return "/trading";
  }

  return "/dashboard";
}
