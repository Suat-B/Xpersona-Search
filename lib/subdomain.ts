/**
 * Subdomain utilities for multi-service architecture.
 * Maps hosts to services: hub (xpersona.co), game (game.xpersona.co), trading (trading.xpersona.co).
 */

export type Service = "hub" | "game" | "trading";

const PROD_ROOT = "xpersona.co";
const LOCAL_ROOT = "localhost";

/**
 * Determine which service the request belongs to based on host.
 * Supports production: game.xpersona.co, trading.xpersona.co, xpersona.co
 * Supports local dev: game.localhost, trading.localhost, localhost
 * Fallback: ?service=game or ?service=trading when host is localhost (no subdomain)
 */
export function getServiceFromHost(
  host: string,
  searchParams?: URLSearchParams
): Service {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";

  // Production: game.xpersona.co, trading.xpersona.co
  if (hostname === `game.${PROD_ROOT}`) return "game";
  if (hostname === `trading.${PROD_ROOT}`) return "trading";
  if (hostname === PROD_ROOT || hostname === `www.${PROD_ROOT}`) return "hub";

  // Local dev: game.localhost, trading.localhost
  if (hostname === "game.localhost") return "game";
  if (hostname === "trading.localhost") return "trading";
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    // Fallback: ?service=game or ?service=trading
    const svc = searchParams?.get("service")?.toLowerCase();
    if (svc === "game") return "game";
    if (svc === "trading") return "trading";
    return "hub";
  }

  // Other subdomains on prod (e.g. www) -> hub
  if (hostname.endsWith(`.${PROD_ROOT}`)) return "hub";

  return "hub";
}

/** Routes that belong to the Game service. */
const GAME_ROUTES = [
  "/",
  "/dashboard",
  "/games",
  "/docs",
  "/embed",
  "/admin",
  "/auth",
  "/auth-error",
] as const;

/** Routes that belong to the Trading service. */
const TRADING_ROUTES = [
  "/",
  "/trading",
  "/auth",
  "/auth-error",
] as const;

/**
 * Routes allowed on Hub (xpersona.co).
 * When subdomains (game, trading) aren't configured in Vercel, the hub serves all routes
 * so the site works on xpersona.co alone.
 */
const HUB_ROUTES = [
  "/",
  "/auth",
  "/register",
  "/terms-of-service",
  "/privacy-policy-1",
  "/auth-error",
  "/dashboard",
  "/games",
  "/trading",
  "/docs",
  "/embed",
  "/admin",
] as const;

function pathStartsWith(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Check if a pathname is allowed on the given service.
 */
export function isAllowedRoute(service: Service, pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/";

  if (service === "hub") {
    return pathStartsWith(normalized, HUB_ROUTES);
  }

  if (service === "game") {
    return (
      pathStartsWith(normalized, GAME_ROUTES) &&
      !pathStartsWith(normalized, ["/trading"])
    );
  }

  if (service === "trading") {
    if (pathStartsWith(normalized, ["/dashboard", "/games", "/docs", "/embed", "/admin"])) {
      return false;
    }
    return pathStartsWith(normalized, TRADING_ROUTES);
  }

  return false;
}

/**
 * Get the path that should be used on the target service for a given pathname.
 * e.g. /trading/developer -> /trading/developer on trading, / -> / on trading
 */
export function getPathForService(pathname: string, targetService: Service): string {
  if (targetService === "hub") return pathname || "/";
  if (targetService === "trading") {
    if (pathname.startsWith("/trading")) return pathname;
    return "/";
  }
  if (targetService === "game") {
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/games") || pathname.startsWith("/docs") || pathname.startsWith("/embed")) {
      return pathname;
    }
    return "/";
  }
  return pathname || "/";
}

/**
 * Get the base URL for a service (no path).
 * Uses NEXT_PUBLIC_APP_URL or NEXTAUTH_URL for production; localhost for dev.
 */
export function getServiceBaseUrl(service: Service): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000";

  try {
    const url = new URL(base);
    const hostname = url.hostname;

    if (hostname.includes("xpersona.co")) {
      const protocol = url.protocol || "https:";
      const port = url.port ? `:${url.port}` : "";
      if (service === "game") return `${protocol}//game.${hostname}${port}`;
      if (service === "trading") return `${protocol}//trading.${hostname}${port}`;
      return `${protocol}//${hostname}${port}`;
    }

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      const protocol = url.protocol || "http:";
      const port = url.port ? `:${url.port}` : ":3000";
      if (service === "game") return `${protocol}//game.localhost${port}`;
      if (service === "trading") return `${protocol}//trading.localhost${port}`;
      return `${protocol}//localhost${port}`;
    }

    return base;
  } catch {
    return base;
  }
}
