/**
 * One-off migration: add account_type, agent_id to users and agent_id to bet tables if missing.
 * Run when: column "account_type" of relation "users" does not exist
 * Usage: npx tsx scripts/add-account-type-column.ts
 */
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function addColumnIfMissing(
  client: import("pg").PoolClient,
  table: string,
  column: string,
  def: string
) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column]
  );
  if (r.rows.length > 0) return false;
  await client.query(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${def}`);
  return true;
}

async function addIndexIfMissing(client: import("pg").PoolClient, name: string, sql: string) {
  const r = await client.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
    [name]
  );
  if (r.rows.length > 0) return false;
  await client.query(sql);
  return true;
}

async function main() {
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    if (await addColumnIfMissing(client, "users", "account_type", "varchar(12) DEFAULT 'human' NOT NULL")) {
      console.log("Added users.account_type");
    }
    if (await addColumnIfMissing(client, "users", "agent_id", "varchar(20)")) {
      console.log("Added users.agent_id");
    }
    if (await addIndexIfMissing(client, "users_agent_id_idx", `CREATE UNIQUE INDEX "users_agent_id_idx" ON "users" USING btree ("agent_id")`)) {
      console.log("Added users_agent_id_idx");
    }
    for (const t of ["game_bets", "blackjack_rounds", "crash_bets", "faucet_grants"]) {
      if (await addColumnIfMissing(client, t, "agent_id", "varchar(20)")) {
        console.log(`Added ${t}.agent_id`);
      }
      const idxName = `${t}_agent_id_idx`;
      if (await addIndexIfMissing(client, idxName, `CREATE INDEX "${idxName}" ON "${t}" USING btree ("agent_id")`)) {
        console.log(`Added ${idxName}`);
      }
    }
    console.log("Migration complete.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
