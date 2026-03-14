import { NextRequest } from "next/server";

export function isAuthorizedCrawlRequest(req: NextRequest): boolean {
  const header = req.headers.get("authorization");
  const token = header?.replace(/^Bearer\s+/i, "").trim();
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return token === secret;
}

export function normalizeDomainInput(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!value) return null;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  if (value.startsWith(".") || value.endsWith(".")) return null;
  return value;
}
