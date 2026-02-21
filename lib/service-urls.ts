/**
 * Base URL helpers for cross-service links.
 * Use for building links to game, trading, and hub subdomains.
 */

import { getServiceBaseUrl, type Service } from "@/lib/subdomain";

export function getGameUrl(path = ""): string {
  const base = getServiceBaseUrl("game");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p === "/" ? "" : p}`;
}

export function getTradingUrl(path = ""): string {
  const base = getServiceBaseUrl("trading");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p === "/" ? "" : p}`;
}

export function getHubUrl(path = ""): string {
  const base = getServiceBaseUrl("hub");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p === "/" ? "" : p}`;
}
