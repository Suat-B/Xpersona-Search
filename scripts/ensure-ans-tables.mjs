#!/usr/bin/env node
/**
 * Ensures ans_domains and ans_subscriptions exist.
 * Run when migrations are out of sync: node scripts/ensure-ans-tables.mjs
 */
import "dotenv/config";
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

const ansDomainsSql = `
CREATE TABLE IF NOT EXISTS "ans_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(63) NOT NULL,
  "full_domain" varchar(255) NOT NULL,
  "owner_id" uuid NOT NULL,
  "agent_card" jsonb,
  "agent_card_version" varchar(16) DEFAULT '1.0',
  "public_key" text,
  "private_key_encrypted" text,
  "verified" boolean DEFAULT false,
  "verified_at" timestamp with time zone,
  "status" varchar(24) DEFAULT 'PENDING_VERIFICATION' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ans_domains_name_unique" UNIQUE("name"),
  CONSTRAINT "ans_domains_full_domain_unique" UNIQUE("full_domain")
);
`;

const ansSubscriptionsSql = `
CREATE TABLE IF NOT EXISTS "ans_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stripe_subscription_id" varchar(255) NOT NULL,
  "user_id" uuid NOT NULL,
  "domain_id" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
  "current_period_start" timestamp with time zone NOT NULL,
  "current_period_end" timestamp with time zone NOT NULL,
  "cancel_at_period_end" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ans_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
`;

async function ensureColumn(client, table, column, type, def) {
  const check = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = $1 AND column_name = $2
  `, [table, column]);
  if (check.rows.length === 0) {
    const defClause = def != null ? ` DEFAULT ${def}` : "";
    await client.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${type}${defClause}`);
  }
}

async function main() {
  await client.connect();
  try {
    await client.query(ansDomainsSql);
    console.log("ans_domains: OK");
    await client.query(ansSubscriptionsSql);
    console.log("ans_subscriptions: OK");

    await ensureColumn(client, "ans_domains", "agent_card_version", "varchar(16)", "'1.0'");
    await ensureColumn(client, "ans_domains", "private_key_encrypted", "text", null);
    await ensureColumn(client, "ans_domains", "verified", "boolean", "false");
    await ensureColumn(client, "ans_domains", "verified_at", "timestamp with time zone", null);

    const fkOwner = await client.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'ans_domains' AND constraint_name = 'ans_domains_owner_id_users_id_fk'
    `);
    if (fkOwner.rows.length === 0) {
      await client.query(`
        ALTER TABLE "ans_domains" ADD CONSTRAINT "ans_domains_owner_id_users_id_fk"
        FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action
      `);
    }
    const fkDomain = await client.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'ans_subscriptions' AND constraint_name = 'ans_subscriptions_domain_id_ans_domains_id_fk'
    `);
    if (fkDomain.rows.length === 0) {
      await client.query(`
        ALTER TABLE "ans_subscriptions" ADD CONSTRAINT "ans_subscriptions_domain_id_ans_domains_id_fk"
        FOREIGN KEY ("domain_id") REFERENCES "public"."ans_domains"("id") ON DELETE restrict ON UPDATE no action
      `);
    }
    const fkUser = await client.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'ans_subscriptions' AND constraint_name = 'ans_subscriptions_user_id_users_id_fk'
    `);
    if (fkUser.rows.length === 0) {
      await client.query(`
        ALTER TABLE "ans_subscriptions" ADD CONSTRAINT "ans_subscriptions_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action
      `);
    }

    console.log("ANS tables ready.");
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
