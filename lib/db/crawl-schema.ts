import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export type CrawlCustomerStatus = "active" | "suspended";
export type CrawlCreditLedgerReason =
  | "purchase"
  | "consume"
  | "refund"
  | "admin_adjustment";

export const crawlCustomers = pgTable(
  "crawl_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).unique(),
    apiKeyHash: varchar("api_key_hash", { length: 64 }).unique(),
    apiKeyPrefix: varchar("api_key_prefix", { length: 16 }),
    creditBalance: integer("credit_balance").notNull().default(0),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("active")
      .$type<CrawlCustomerStatus>(),
    hasActiveKey: boolean("has_active_key").notNull().default(false),
    lastKeyRotatedAt: timestamp("last_key_rotated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("crawl_customers_email_idx").on(table.email),
    uniqueIndex("crawl_customers_stripe_customer_id_idx").on(table.stripeCustomerId),
    uniqueIndex("crawl_customers_api_key_hash_idx").on(table.apiKeyHash),
    index("crawl_customers_status_idx").on(table.status),
    index("crawl_customers_updated_idx").on(table.updatedAt),
  ]
);

export const crawlCreditLedger = pgTable(
  "crawl_credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => crawlCustomers.id, { onDelete: "cascade" }),
    deltaCredits: integer("delta_credits").notNull(),
    reason: varchar("reason", { length: 24 }).notNull().$type<CrawlCreditLedgerReason>(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    path: text("path"),
    botName: varchar("bot_name", { length: 64 }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("crawl_credit_ledger_idempotency_idx").on(table.idempotencyKey),
    index("crawl_credit_ledger_customer_created_idx").on(table.customerId, table.createdAt),
    index("crawl_credit_ledger_reason_idx").on(table.reason),
    index("crawl_credit_ledger_checkout_idx").on(table.stripeCheckoutSessionId),
  ]
);
