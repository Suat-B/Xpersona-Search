/**
 * Edge-compatible agent and guest token verification (Web Crypto).
 * Use in middleware. Node API routes use auth-utils createAgentToken/verifyAgentToken etc.
 */
const AGENT_COOKIE_NAME = "xp_agent_session";
const GUEST_COOKIE_NAME = "xp_guest_session";

export function getAgentCookieName(): string {
  return AGENT_COOKIE_NAME;
}

export function getGuestCookieName(): string {
  return GUEST_COOKIE_NAME;
}

function getSecret(): string | null {
  const s =
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "development"
      ? "xpersona-dev-secret-min-32-chars-do-not-use-in-production"
      : "");
  return s || null;
}

function base64UrlDecodeToStr(token: string): string {
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = atob(padded);
  return new TextDecoder().decode(new Uint8Array([...binary].map((c) => c.charCodeAt(0))));
}

export async function verifyAgentTokenEdge(token: string): Promise<string | null> {
  try {
    const secret = getSecret();
    if (!secret) return null;
    const raw = base64UrlDecodeToStr(token);
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const [userId, exp, sig] = parts;
    if (!userId || !exp || !sig) return null;
    if (Date.now() > parseInt(exp, 10)) return null;
    const payload = userId + "." + exp;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const expectedHex = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (expectedHex.length !== sig.length) return null;
    for (let i = 0; i < expectedHex.length; i++) {
      if (expectedHex[i] !== sig[i]) return null;
    }
    return userId;
  } catch {
    return null;
  }
}

/** Same as verifyAgentTokenEdge but for guest cookie (same token format). */
export async function verifyGuestTokenEdge(token: string): Promise<string | null> {
  return verifyAgentTokenEdge(token);
}
