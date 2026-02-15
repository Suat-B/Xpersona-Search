/**
 * Backfill accountType and agentId for existing users.
 * Run after applying schema migration (0001_blushing_the_executioner.sql).
 *
 * Usage: npx tsx scripts/backfill-agent-ids.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import { users } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { generateAgentId } from "../lib/agent-id";

async function backfill() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const allUsers = await db.select({ id: users.id, email: users.email, googleId: users.googleId, accountType: users.accountType, agentId: users.agentId }).from(users);

  let updated = 0;
  let agentsFixed = 0;

  for (const u of allUsers) {
    const email = (u.email ?? "").toLowerCase();
    let newAccountType: "agent" | "human" | "google" | null = null;

    if (email.endsWith("@xpersona.agent")) {
      newAccountType = "agent";
      if (!u.agentId) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const aid = generateAgentId();
          try {
            await db.update(users).set({ accountType: "agent", agentId: aid }).where(eq(users.id, u.id));
            agentsFixed++;
            updated++;
            break;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("unique") || msg.includes("duplicate")) continue;
            throw e;
          }
        }
        continue;
      }
    } else if (email.endsWith("@xpersona.human") || email.endsWith("@xpersona.guest") || email.endsWith("@xpersona.local")) {
      newAccountType = "human";
    } else if (u.googleId) {
      newAccountType = "google";
    }

    if (newAccountType && u.accountType !== newAccountType) {
      await db.update(users).set({ accountType: newAccountType }).where(eq(users.id, u.id));
      updated++;
    }
  }

  console.log(`Backfill complete: ${updated} users updated, ${agentsFixed} agents assigned agentId.`);
}

backfill()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
