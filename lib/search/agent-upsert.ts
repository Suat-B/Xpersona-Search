/**
 * Upsert an agent row with slug conflict retry.
 * If insert fails due to unique violation on slug (different sourceId, same slug),
 * retries with slug-2, slug-3, ... so the crawl does not stop on slug collision.
 */
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";

type AgentInsert = typeof agents.$inferInsert;
type ConflictSet = Partial<AgentInsert>;

const SLUG_CONSTRAINT_PATTERN = /slug|agents_slug/;
const PG_UNIQUE_VIOLATION = "23505";
const MAX_SLUG_RETRIES = 10;

function isSlugUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const constraint = (err as { constraint?: string })?.constraint;
  const message = (err as { message?: string })?.message ?? "";
  return (
    code === PG_UNIQUE_VIOLATION &&
    (SLUG_CONSTRAINT_PATTERN.test(constraint ?? "") ||
      SLUG_CONSTRAINT_PATTERN.test(message))
  );
}

function nextSlug(baseSlug: string, attempt: number): string {
  const base = baseSlug.replace(/-?\d+$/, "").slice(0, 60);
  const suffix = attempt + 2;
  return `${base}-${suffix}`.slice(0, 255);
}

/**
 * Insert or update agent. On slug unique violation, retries with suffixed slug.
 */
export async function upsertAgent(
  values: AgentInsert,
  conflictSet: ConflictSet
): Promise<void> {
  let slug = values.slug;
  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    try {
      await db
        .insert(agents)
        .values({ ...values, slug })
        .onConflictDoUpdate({
          target: agents.sourceId,
          set: { ...conflictSet, slug, updatedAt: new Date() },
        });
      return;
    } catch (err) {
      if (isSlugUniqueViolation(err) && attempt < MAX_SLUG_RETRIES - 1) {
        slug = nextSlug(slug, attempt);
      } else {
        throw err;
      }
    }
  }
}
