import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const trustTableCache = new Map<string, boolean>();

export async function hasTrustTable(tableName: string): Promise<boolean> {
  if (trustTableCache.has(tableName)) return trustTableCache.get(tableName) ?? false;
  try {
    const result = await db.execute(sql`SELECT to_regclass(${`public.${tableName}`}) AS regclass`);
    const row = (result as unknown as { rows?: Array<{ regclass?: string | null }> }).rows?.[0];
    const exists = Boolean(row?.regclass);
    trustTableCache.set(tableName, exists);
    return exists;
  } catch {
    trustTableCache.set(tableName, false);
    return false;
  }
}

export function clearTrustTableCache() {
  trustTableCache.clear();
}
