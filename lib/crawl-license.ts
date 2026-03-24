import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCrawlerName } from "@/lib/bot-detect";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import { parseAgentDetailSlugFromPath } from "@/lib/agents/route-patterns";

export const CRAWL_LICENSE_COOKIE = "xp_crawl_license";
export const CRAWL_CUSTOMER_ID_HEADER = "x-crawl-customer-id";
export const CRAWL_KEY_PREFIX_HEADER = "x-crawl-key-prefix";
export const CRAWL_TOKEN_VERIFIED_HEADER = "x-crawl-token-verified";
export const INTERNAL_CRAWL_RENDER_HEADER = "x-internal-crawl-render";

export type CrawlPackageId = "starter" | "growth" | "scale";

export type CrawlLicensePayload = {
  v: 2;
  sub: string;
  kid: string;
  exp: number;
  aud: "xpersona-crawl";
};

export type CrawlPackageConfig = {
  id: CrawlPackageId;
  label: string;
  credits: number;
  envKey: string;
};

export type CrawlPackageSummary = CrawlPackageConfig & {
  priceIdConfigured: boolean;
};

type HeaderLookup = {
  get(name: string): string | null;
};

type CookieLookup = {
  get(name: string): { value?: string } | undefined;
};

const CRAWL_PACKAGES: readonly CrawlPackageConfig[] = [
  {
    id: "starter",
    label: "Starter",
    credits: 10_000,
    envKey: "STRIPE_CRAWL_PRICE_ID_STARTER",
  },
  {
    id: "growth",
    label: "Growth",
    credits: 100_000,
    envKey: "STRIPE_CRAWL_PRICE_ID_GROWTH",
  },
  {
    id: "scale",
    label: "Scale",
    credits: 1_000_000,
    envKey: "STRIPE_CRAWL_PRICE_ID_SCALE",
  },
] as const;

function getSecret(): string {
  return process.env.CRAWL_LICENSE_SECRET?.trim() ?? "";
}

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i]! ^ b[i]!;
  return out === 0;
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function readCookieValue(cookieLookup: CookieLookup | null | undefined, name: string): string | null {
  const raw = cookieLookup?.get(name);
  const value = typeof raw?.value === "string" ? raw.value.trim() : "";
  return value.length > 0 ? value : null;
}

function readCookieHeaderValue(headers: HeaderLookup, name: string): string | null {
  const cookieHeader = headers.get("cookie") ?? "";
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`, "i").exec(cookieHeader);
  const value = match?.[1]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function isPayPerCrawlEnabled(): boolean {
  const v = process.env.ENABLE_PAY_PER_CRAWL?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function hasCrawlLicenseSecretConfigured(): boolean {
  return getSecret().length >= 16;
}

export function getCrawlLicenseTokenTtlSeconds(): number {
  const raw = Number(process.env.CRAWL_LICENSE_TTL_SECONDS?.trim());
  if (!Number.isFinite(raw) || raw <= 0) return 3600;
  return Math.max(300, Math.min(Math.floor(raw), 365 * 24 * 3600));
}

export function getCrawlPackages(): readonly CrawlPackageConfig[] {
  return CRAWL_PACKAGES;
}

export function getCrawlPackage(packageId: string | null | undefined): CrawlPackageConfig | null {
  if (!packageId) return null;
  const normalized = packageId.trim().toLowerCase();
  return CRAWL_PACKAGES.find((pkg) => pkg.id === normalized) ?? null;
}

export function getCrawlPackagePriceId(packageId: CrawlPackageId): string | null {
  const pkg = getCrawlPackage(packageId);
  const priceId = pkg ? process.env[pkg.envKey]?.trim() : "";
  return priceId && priceId.length > 0 ? priceId : null;
}

export function getConfiguredCrawlPackages(): CrawlPackageSummary[] {
  return CRAWL_PACKAGES.map((pkg) => ({
    ...pkg,
    priceIdConfigured: getCrawlPackagePriceId(pkg.id) !== null,
  }));
}

export function requiresCrawlLicense(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/";
  if (parseAgentDetailSlugFromPath(p)) return true;
  return /^\/api\/v1\/agents\/[^/]+\/(snapshot|contract|trust)(\/|$)/.test(p);
}

export function normalizeCrawlEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getCrawlTokenFromHeaders(
  headers: HeaderLookup,
  cookieLookup?: CookieLookup | null
): string | null {
  const header =
    headers.get("x-crawl-license")?.trim() ||
    (() => {
      const auth = headers.get("authorization") ?? "";
      if (auth.toLowerCase().startsWith("crawl ")) return auth.slice(6).trim();
      return "";
    })();
  if (header.length > 0) return header;
  return (
    readCookieValue(cookieLookup, CRAWL_LICENSE_COOKIE) ??
    readCookieHeaderValue(headers, CRAWL_LICENSE_COOKIE)
  );
}

export function getCrawlTokenFromRequest(req: Pick<NextRequest, "headers" | "cookies">): string | null {
  return getCrawlTokenFromHeaders(req.headers, req.cookies);
}

export function getCrawlApiKeyFromHeaders(headers: HeaderLookup): string | null {
  const auth = headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function getCrawlLicenseUrls(origin: string) {
  return {
    licenseUrl: `${origin}/api/v1/crawl-license`,
    checkoutUrl: `${origin}/api/v1/crawl-license/checkout`,
    revealUrl: `${origin}/api/v1/crawl-license/reveal`,
    statusUrl: `${origin}/api/v1/crawl-license/status`,
    rotateKeyUrl: `${origin}/api/v1/crawl-license/rotate-key`,
    successUrl: `${origin}/crawl-license/success`,
  };
}

export function createCrawlLicenseRequiredResponse(
  request: Request,
  origin: string,
  options?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  }
): NextResponse {
  const requestId = getOrCreateRequestId(request);
  const urls = getCrawlLicenseUrls(origin);
  const response = NextResponse.json(
    {
      success: false,
      error: {
        code: options?.code ?? "CRAWL_LICENSE_REQUIRED",
        message:
          options?.message ??
          "A paid crawl license is required for this premium resource.",
        licenseUrl: urls.licenseUrl,
        checkoutUrl: urls.checkoutUrl,
        statusUrl: urls.statusUrl,
        ...(options?.details ? { details: options.details } : {}),
      },
      requestId,
    },
    { status: 402 }
  );
  response.headers.set("Content-Type", "application/json");
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("License-URL", urls.licenseUrl);
  response.headers.set("Checkout-URL", urls.checkoutUrl);
  response.headers.set("Status-URL", urls.statusUrl);
  return response;
}

export async function verifyCrawlLicenseToken(
  token: string | null | undefined
): Promise<CrawlLicensePayload | null> {
  const secret = getSecret();
  if (!token || secret.length < 16) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const sigBytes = fromBase64Url(sigB64);
  if (!sigBytes) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const expectedBytes = new Uint8Array(expectedBuf);
  if (!timingSafeEqualBytes(expectedBytes, sigBytes)) return null;

  let json: string;
  try {
    const payloadBytes = fromBase64Url(payloadB64);
    if (!payloadBytes) return null;
    json = new TextDecoder().decode(payloadBytes);
  } catch {
    return null;
  }

  let parsed: CrawlLicensePayload;
  try {
    parsed = JSON.parse(json) as CrawlLicensePayload;
  } catch {
    return null;
  }

  if (parsed.v !== 2 || parsed.aud !== "xpersona-crawl") return null;
  if (typeof parsed.sub !== "string" || parsed.sub.trim().length === 0) return null;
  if (typeof parsed.kid !== "string" || parsed.kid.trim().length === 0) return null;
  if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (parsed.exp < now) return null;

  return parsed;
}

export async function getVerifiedCrawlPayloadFromHeaders(
  headers: HeaderLookup,
  cookieLookup?: CookieLookup | null
): Promise<CrawlLicensePayload | null> {
  const token = getCrawlTokenFromHeaders(headers, cookieLookup);
  return verifyCrawlLicenseToken(token);
}

export function isLicensedCrawlerRequest(headers: HeaderLookup): boolean {
  const userAgent = headers.get("user-agent");
  return getCrawlerName(userAgent) !== null;
}

export function buildCrawlConsumeIdempotencyKey(
  requestId: string,
  method: string,
  pathname: string
): string {
  return `${requestId}:${method.toUpperCase()}:${pathname}`;
}

export function encodeCrawlLicensePayload(payload: CrawlLicensePayload): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}
