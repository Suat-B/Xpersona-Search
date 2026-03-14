const PRIVATE_IPV4_RE =
  /(^127\.)|(^10\.)|(^192\.168\.)|(^169\.254\.)|(^172\.(1[6-9]|2\d|3[0-1])\.)/;

export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  return PRIVATE_IPV4_RE.test(host);
}

function stripTrackingParams(url: URL): void {
  const dropPrefixes = ["utm_", "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid"];
  for (const key of [...url.searchParams.keys()]) {
    if (dropPrefixes.some((p) => key.toLowerCase().startsWith(p))) {
      url.searchParams.delete(key);
    }
  }
}

export function normalizePublicHttpsUrl(raw: string, baseUrl?: string): string | null {
  try {
    const parsed = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (isPrivateOrLocalHost(parsed.hostname)) return null;
    parsed.hash = "";
    stripTrackingParams(parsed);
    // Normalize path slashes and trailing slash.
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getDomainFromUrl(inputUrl: string): string | null {
  try {
    return new URL(inputUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}
