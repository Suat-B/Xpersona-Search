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
export type PlaygroundMode = "auto" | "plan" | "yolo" | "generate" | "debug";
export type PlaygroundMessageRole = "system" | "user" | "assistant" | "agent";
export type PlaygroundRunRole = "planner" | "implementer" | "reviewer" | "single";
export type PlaygroundRunStatus = "queued" | "running" | "completed" | "failed";
export type PlaygroundActionType = "edit" | "command" | "index" | "sync" | "rollback";
export type PlaygroundActionStatus = "approved" | "blocked" | "executed" | "failed";

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

// Cloud history sessions for Playground extension
export const playgroundSessions = pgTable(
  "playground_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }),
    mode: varchar("mode", { length: 20 }).notNull().default("auto").$type<PlaygroundMode>(),
    workspaceFingerprint: varchar("workspace_fingerprint", { length: 128 }),
    metadata: jsonb("metadata"),
    traceId: varchar("trace_id", { length: 64 }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("playground_sessions_user_created_idx").on(table.userId, table.createdAt),
    index("playground_sessions_user_updated_idx").on(table.userId, table.updatedAt),
  ]
);

// Message timeline for each session
export const playgroundMessages = pgTable(
  "playground_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => playgroundSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().$type<PlaygroundMessageRole>(),
    kind: varchar("kind", { length: 40 }).notNull().default("message"),
    content: text("content").notNull(),
    payload: jsonb("payload"),
    tokenCount: integer("token_count"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("playground_messages_session_created_idx").on(table.sessionId, table.createdAt),
    index("playground_messages_user_created_idx").on(table.userId, table.createdAt),
  ]
);

// Multi-agent run records
export const playgroundAgentRuns = pgTable(
  "playground_agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => playgroundSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().$type<PlaygroundRunRole>(),
    status: varchar("status", { length: 20 }).notNull().default("queued").$type<PlaygroundRunStatus>(),
    confidence: doublePrecision("confidence"),
    riskLevel: varchar("risk_level", { length: 20 }),
    input: jsonb("input"),
    output: jsonb("output"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("playground_agent_runs_session_created_idx").on(table.sessionId, table.createdAt),
    index("playground_agent_runs_user_created_idx").on(table.userId, table.createdAt),
  ]
);

// Action/audit logs for YOLO execution and policy checks
export const playgroundActionLogs = pgTable(
  "playground_action_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => playgroundSessions.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actionType: varchar("action_type", { length: 20 }).notNull().$type<PlaygroundActionType>(),
    status: varchar("status", { length: 20 }).notNull().$type<PlaygroundActionStatus>(),
    payload: jsonb("payload"),
    reason: text("reason"),
    durationMs: integer("duration_ms"),
    exitCode: integer("exit_code"),
    stdoutExcerpt: text("stdout_excerpt"),
    stderrExcerpt: text("stderr_excerpt"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("playground_action_logs_user_created_idx").on(table.userId, table.createdAt),
    index("playground_action_logs_session_created_idx").on(table.sessionId, table.createdAt),
  ]
);

// Cloud index shards/chunks synced by extension
export const playgroundIndexChunks = pgTable(
  "playground_index_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectKey: varchar("project_key", { length: 255 }).notNull(),
    pathHash: varchar("path_hash", { length: 128 }).notNull(),
    chunkHash: varchar("chunk_hash", { length: 128 }).notNull(),
    pathDisplay: text("path_display"),
    content: text("content").notNull(),
    embedding: jsonb("embedding"),
    tokenEstimate: integer("token_estimate"),
    embeddingModel: varchar("embedding_model", { length: 128 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("playground_index_chunks_unique_idx").on(table.userId, table.projectKey, table.pathHash, table.chunkHash),
    index("playground_index_chunks_user_project_idx").on(table.userId, table.projectKey),
  ]
);

// Per-project sync status used for hybrid local+cloud indexing
export const playgroundIndexSyncState = pgTable(
  "playground_index_sync_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectKey: varchar("project_key", { length: 255 }).notNull(),
    lastCursor: varchar("last_cursor", { length: 255 }),
    stats: jsonb("stats"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("playground_index_sync_state_user_project_idx").on(table.userId, table.projectKey),
  ]
);

// Uploaded attachments metadata (images today, extensible later)
export const playgroundAttachments = pgTable(
  "playground_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => playgroundSessions.id, { onDelete: "set null" }),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    storageUrl: text("storage_url"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("playground_attachments_user_created_idx").on(table.userId, table.createdAt),
    index("playground_attachments_session_created_idx").on(table.sessionId, table.createdAt),
  ]
);

// Replay run records for one-click session replay with drift reports
export const playgroundReplayRuns = pgTable(
  "playground_replay_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceSessionId: uuid("source_session_id")
      .notNull()
      .references(() => playgroundSessions.id, { onDelete: "cascade" }),
    workspaceFingerprint: varchar("workspace_fingerprint", { length: 128 }).notNull(),
    driftSummary: text("drift_summary").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued").$type<PlaygroundRunStatus>(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("playground_replay_runs_user_created_idx").on(table.userId, table.createdAt),
    index("playground_replay_runs_source_session_idx").on(table.sourceSessionId),
  ]
);
