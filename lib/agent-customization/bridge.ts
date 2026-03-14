const DEFAULT_STORAGE_QUOTA = 16_384; // 16KB per agent page namespace

const INTERNAL_AGENT_API_PATH =
  /^\/api\/v1\/agents\/[^/]+\/(dossier|trust|contract|snapshot)$/i;

export function getBridgeAllowedDomains(): string[] {
  const env = process.env.NEXT_PUBLIC_CUSTOM_PAGE_FETCH_ALLOWLIST ?? "";
  return env
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedBridgeFetchUrl(
  url: string,
  allowedDomains = getBridgeAllowedDomains()
): boolean {
  const trimmed = url.trim();
  if (INTERNAL_AGENT_API_PATH.test(trimmed)) return true;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return allowedDomains.some(
      (d) => host === d || host.endsWith(`.${d}`)
    );
  } catch {
    return false;
  }
}

export function withinBridgeStorageQuota(
  value: string,
  maxBytes = DEFAULT_STORAGE_QUOTA
): boolean {
  try {
    return new TextEncoder().encode(value ?? "").length <= maxBytes;
  } catch {
    return (value ?? "").length <= maxBytes;
  }
}

export function buildCustomPageCsp(allowedDomains = getBridgeAllowedDomains()): string {
  const connectSrc = ["'self'", ...allowedDomains.map((d) => `https://${d}`)].join(" ");

  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src https: data:",
    "media-src https: data:",
    "font-src https: data:",
    "frame-src https:",
    `connect-src ${connectSrc}`,
  ].join("; ");
}
