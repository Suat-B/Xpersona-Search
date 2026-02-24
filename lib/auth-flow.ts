export type AuthMode = "signin" | "signup";
export type LinkType = "agent" | "guest";

type PermanentAccountRequiredPayload = {
  success: false;
  error: "PERMANENT_ACCOUNT_REQUIRED";
  message: string;
  accountType: string | null;
  upgradeUrl: string;
};

export function isTemporaryAccountType(
  accountType: string | null | undefined
): boolean {
  return accountType === "agent" || accountType === "human";
}

export function linkTypeForAccount(
  accountType: string | null | undefined
): LinkType | null {
  if (accountType === "agent") return "agent";
  if (accountType === "human") return "guest";
  return null;
}

export function normalizeCallbackUrl(
  callbackUrl: string | null | undefined
): string | null {
  if (!callbackUrl) return null;
  const trimmed = callbackUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    return null;
  }
}

export function resolveUpgradeCallbackPath(
  fallbackPath: string,
  referer: string | null | undefined
): string {
  const normalizedReferer = normalizeCallbackUrl(referer);
  if (normalizedReferer && !normalizedReferer.startsWith("/api/")) {
    return normalizedReferer;
  }
  return normalizeCallbackUrl(fallbackPath) ?? "/";
}

export function buildUpgradeAuthUrl(
  mode: AuthMode,
  accountType: string | null | undefined,
  callbackUrl?: string | null
): string {
  const basePath = mode === "signin" ? "/auth/signin" : "/auth/signup";
  const params = new URLSearchParams();

  const linkType = linkTypeForAccount(accountType);
  if (linkType) params.set("link", linkType);

  const normalizedCallback = normalizeCallbackUrl(callbackUrl);
  if (normalizedCallback) params.set("callbackUrl", normalizedCallback);

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildPermanentAccountRequiredPayload(
  accountType: string | null | undefined,
  callbackUrl: string,
  mode: AuthMode = "signup"
): PermanentAccountRequiredPayload {
  return {
    success: false,
    error: "PERMANENT_ACCOUNT_REQUIRED",
    message:
      "Create or sign in with a permanent account to continue this action.",
    accountType: accountType ?? null,
    upgradeUrl: buildUpgradeAuthUrl(mode, accountType, callbackUrl),
  };
}
