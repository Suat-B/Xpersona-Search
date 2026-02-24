/**
 * Admin authorization for Xpersona.
 * Admins are designated via ADMIN_EMAILS env (comma-separated, case-insensitive).
 */

import type { AuthUser } from "@/lib/auth-utils";

const ADMIN_EMAILS_KEY = "ADMIN_EMAILS";

function getAdminEmails(): Set<string> {
  const raw = process.env[ADMIN_EMAILS_KEY]?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Check if the given email is an admin. Case-insensitive. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return getAdminEmails().has(email.trim().toLowerCase());
}

/** Check if the authenticated user is an admin. */
export function isAdmin(user: AuthUser): boolean {
  return isAdminEmail(user.email);
}
