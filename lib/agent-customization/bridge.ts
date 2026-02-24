const DEFAULT_STORAGE_QUOTA = 16_384; // 16KB per agent page namespace

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
  try {
    const parsed = new URL(url);
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
  const connectSrc =
    allowedDomains.length > 0
      ? ["'self'", ...allowedDomains.map((d) => `https://${d}`)].join(" ")
      : "'none'";

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
