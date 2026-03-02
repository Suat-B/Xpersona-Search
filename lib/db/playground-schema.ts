import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
  date,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

/** Playground subscription tier: trial (2-day) or paid ($3/month) */
export type PlaygroundPlanTier = "trial" | "paid";

/** Playground subscription status */
export type PlaygroundSubscriptionStatus = "active" | "cancelled" | "past_due" | "trial";

/** HF usage log status */
export type HfUsageStatus = "success" | "error" | "rate_limited" | "quota_exceeded" | "validation_error";

// Playground subscriptions — HF inference router billing
export const playgroundSubscriptions = pgTable(
  "playground_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }).unique(),
    /** 'trial' | 'paid' - simplified 2-tier system */
    planTier: varchar("plan_tier", { length: 20 }).notNull().$type<PlaygroundPlanTier>(),
    /** 'active' | 'cancelled' | 'past_due' | 'trial' */
    status: varchar("status", { length: 20 }).notNull().default("trial").$type<PlaygroundSubscriptionStatus>(),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("playground_subscriptions_user_id_idx").on(table.userId),
    uniqueIndex("playground_subscriptions_stripe_idx").on(table.stripeSubscriptionId),
    index("playground_subscriptions_status_idx").on(table.status),
  ]
);

// HF usage logs - every request is logged here
export const hfUsageLogs = pgTable(
  "hf_usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => playgroundSubscriptions.id),
    model: varchar("model", { length: 100 }).notNull(),
    /** Provider: nscale, together, fal-ai, etc. */
    provider: varchar("provider", { length: 50 }).notNull().default("nscale"),
    tokensInput: integer("tokens_input").notNull().default(0),
    tokensOutput: integer("tokens_output").notNull().default(0),
    /** Estimated cost in USD based on HF pricing */
    estimatedCostUsd: doublePrecision("estimated_cost_usd"),
    latencyMs: integer("latency_ms"),
    /** 'success' | 'error' | 'rate_limited' | 'quota_exceeded' | 'validation_error' */
    status: varchar("status", { length: 20 }).notNull().$type<HfUsageStatus>(),
    errorMessage: text("error_message"),
    /** Hash of request for idempotency */
    requestHash: varchar("request_hash", { length: 64 }),
    /** Full request payload for debugging */
    requestPayload: jsonb("request_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("hf_usage_logs_user_created_idx").on(table.userId, table.createdAt),
    index("hf_usage_logs_model_idx").on(table.model),
    index("hf_usage_logs_status_idx").on(table.status),
    index("hf_usage_logs_date_idx").on(table.createdAt),
  ]
);

// Daily usage aggregates for fast quota checks
export const hfDailyUsage = pgTable(
  "hf_daily_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    requestsCount: integer("requests_count").notNull().default(0),
    tokensInput: integer("tokens_input").notNull().default(0),
    tokensOutput: integer("tokens_output").notNull().default(0),
    estimatedCostUsd: doublePrecision("estimated_cost_usd").default(0),
  },
  (table) => [
    uniqueIndex("hf_daily_usage_user_date_idx").on(table.userId, table.usageDate),
  ]
);

// Monthly usage aggregates for monthly caps
export const hfMonthlyUsage = pgTable(
  "hf_monthly_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageYear: integer("usage_year").notNull(),
    usageMonth: integer("usage_month").notNull(),
    requestsCount: integer("requests_count").notNull().default(0),
    tokensOutput: integer("tokens_output").notNull().default(0),
    estimatedCostUsd: doublePrecision("estimated_cost_usd").default(0),
  },
  (table) => [
    uniqueIndex("hf_monthly_usage_user_year_month_idx").on(table.userId, table.usageYear, table.usageMonth),
  ]
);
