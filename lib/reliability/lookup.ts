import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function resolveAgentId(input: string) {
  if (!input) return null;
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(input);
  if (isUuid) return input;
  const [row] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.slug, input))
    .limit(1);
  return row?.id ?? null;
}

export async function resolveAgentByIdOrSlug(input: string) {
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(input);
  const [row] = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      capabilities: agents.capabilities,
    })
    .from(agents)
    .where(isUuid ? eq(agents.id, input) : eq(agents.slug, input))
    .limit(1);
  return row ?? null;
}

export async function agentExists(agentId: string) {
  const result = await db.execute(
    sql`SELECT 1 FROM agents WHERE id = ${agentId}::uuid LIMIT 1`
  );
  const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  return rows.length > 0;
}
