/**
 * Shared ANS domain validation — used by /api/ans/check and client-side normalization.
 * Single source of truth per XPERSONA ANS.MD.
 */

export const ANS_TLD = "xpersona.agent";

const RESERVED_NAMES = new Set([
  "www", "api", "admin", "mail", "ftp", "smtp", "pop", "imap",
  "ns1", "ns2", "dns", "test", "demo", "staging", "prod",
  "agent", "app", "auth", "cdn", "cloud", "db", "dev",
  "email", "gateway", "graphql", "grpc", "help", "img", "js",
  "login", "oauth", "pay", "rest", "rpc", "shop", "ssl", "status",
  "support", "ws", "xml", "xpersona", "root", "localhost",
]);

const VALID_NAME_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export type ValidationCode =
  | "INVALID_LENGTH"
  | "INVALID_FORMAT"
  | "RESERVED_NAME"
  | "CONSECUTIVE_HYPHENS"
  | "EMPTY";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: ValidationCode;
  normalized?: string;
}

/**
 * Normalize raw input: trim, lowercase, strip disallowed chars, remove leading/trailing hyphens.
 */
export function sanitizeAgentName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

/**
 * Validate agent domain name per DNS standards and reserved words.
 */
export function validateAgentName(name: string): ValidationResult {
  const raw = name.trim();
  if (!raw) {
    return {
      valid: false,
      error: "Enter a domain name",
      code: "EMPTY",
    };
  }

  const trimmed = raw.trim();
  if (/^-/.test(trimmed) || /-$/.test(trimmed)) {
    return {
      valid: false,
      error:
        "Use only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.",
      code: "INVALID_FORMAT",
      normalized: sanitizeAgentName(raw),
    };
  }
  if (/[^a-z0-9-]/i.test(trimmed)) {
    return {
      valid: false,
      error:
        "Use only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.",
      code: "INVALID_FORMAT",
      normalized: sanitizeAgentName(raw),
    };
  }
  const normalized = sanitizeAgentName(raw);
  if (normalized.length < 3) {
    return {
      valid: false,
      error: "Domain name must be at least 3 characters",
      code: "INVALID_LENGTH",
      normalized: normalized || undefined,
    };
  }
  if (normalized.length > 63) {
    return {
      valid: false,
      error: "Domain name must be 63 characters or fewer",
      code: "INVALID_LENGTH",
      normalized,
    };
  }

  if (!VALID_NAME_REGEX.test(normalized)) {
    return {
      valid: false,
      error:
        "Use only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.",
      code: "INVALID_FORMAT",
      normalized,
    };
  }

  if (RESERVED_NAMES.has(normalized)) {
    return {
      valid: false,
      error: "This domain name is reserved",
      code: "RESERVED_NAME",
      normalized,
    };
  }

  if (normalized.includes("--")) {
    return {
      valid: false,
      error: "Domain name cannot contain consecutive hyphens",
      code: "CONSECUTIVE_HYPHENS",
      normalized,
    };
  }

  return { valid: true, normalized };
}

/**
 * Generate alternative suggestions when a name is taken.
 */
export function getSuggestions(baseName: string): string[] {
  const safe = baseName.slice(0, 50);
  return [`${safe}-agent`, `${safe}-bot`, `my-${safe}`];
}
