import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  bigint,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { agents } from "./search-schema";

/** Account type: agent (AI), human (decoy), google (OAuth, deprecated), email (credentials). */
export type AccountType = "agent" | "human" | "google" | "email";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    image: text("image"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    googleId: varchar("google_id", { length: 255 }).unique(),
    /** Bcrypt hash for email/password users. Null for OAuth, guest, agent. */
    passwordHash: varchar("password_hash", { length: 255 }),
    /** 'agent' | 'human' | 'google' | 'email'. Enables indexed queries without email parsing. */
    accountType: varchar("account_type", { length: 12 }).notNull().default("human"),
    /** Stable audit identifier for agents: aid_ + 8 alphanumeric. Null for humans. */
    agentId: varchar("agent_id", { length: 20 }).unique(),
    credits: integer("credits").notNull().default(0),
    /** Portion of credits from faucet; ABSOLUTELY non-withdrawable (0% chance). Only burnable via bets. */
    faucetCredits: integer("faucet_credits").notNull().default(0),
    apiKeyHash: varchar("api_key_hash", { length: 64 }).unique(),
    apiKeyPrefix: varchar("api_key_prefix", { length: 12 }),
    apiKeyCreatedAt: timestamp("api_key_created_at", { withTimezone: true }),
    /** Set when user first views/copies their API key (Connect AI or API page). Used to avoid showing "AI connected" before user has seen key. */
    apiKeyViewedAt: timestamp("api_key_viewed_at", { withTimezone: true }),
    /** Stripe customer ID for ANS and other subscription billing. */
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    lastFaucetAt: timestamp("last_faucet_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("users_google_id_idx").on(table.googleId),
    uniqueIndex("users_stripe_customer_id_idx").on(table.stripeCustomerId),
    uniqueIndex("users_api_key_hash_idx").on(table.apiKeyHash),
    uniqueIndex("users_email_idx").on(table.email),
    uniqueIndex("users_agent_id_idx").on(table.agentId),
  ]
);

export const creditPackages = pgTable("credit_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripePriceId: varchar("stripe_price_id", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 100 }),
  credits: integer("credits").notNull(),
  amountCents: integer("amount_cents").notNull(),
  active: boolean("active").default(true),
  sortOrder: integer("sort_order").default(0),
});

export const gameBets = pgTable(
  "game_bets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Agent audit ID when bet placed via agent API key. Null for human/cookie auth. */
    agentId: varchar("agent_id", { length: 20 }),
    gameType: varchar("game_type", { length: 20 }).notNull(),
    amount: integer("amount").notNull(),
    outcome: varchar("outcome", { length: 10 }).notNull(),
    payout: integer("payout").notNull(),
    resultPayload: jsonb("result_payload"),
    serverSeedId: uuid("server_seed_id").references(() => serverSeeds.id),
    clientSeed: text("client_seed"),
    nonce: bigint("nonce", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("game_bets_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("game_bets_game_created_idx").on(table.gameType, table.createdAt),
    index("game_bets_agent_id_idx").on(table.agentId),
  ]
);

export const serverSeeds = pgTable("server_seeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  seedHash: varchar("seed_hash", { length: 64 }).notNull(),
  seed: varchar("seed", { length: 64 }),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const blackjackRounds = pgTable(
  "blackjack_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Agent audit ID when placed via agent API key. Null for human auth. */
    agentId: varchar("agent_id", { length: 20 }),
    betAmount: integer("bet_amount").notNull(),
    playerHands: jsonb("player_hands").notNull(),
    dealerHand: jsonb("dealer_hand").notNull(),
    deck: jsonb("deck").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    serverSeedId: uuid("server_seed_id").references(() => serverSeeds.id),
    clientSeed: text("client_seed"),
    nonce: bigint("nonce", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("blackjack_rounds_agent_id_idx").on(table.agentId)]
);

export const crashRounds = pgTable(
  "crash_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crashPoint: doublePrecision("crash_point").notNull(),
    serverSeedId: uuid("server_seed_id").references(() => serverSeeds.id),
    clientSeed: text("client_seed"),
    nonce: bigint("nonce", { mode: "number" }),
    status: varchar("status", { length: 20 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("crash_rounds_status_started_idx").on(
      table.status,
      table.startedAt
    ),
  ]
);

export const crashBets = pgTable(
  "crash_bets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crashRoundId: uuid("crash_round_id")
      .notNull()
      .references(() => crashRounds.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Agent audit ID when bet placed via agent API key. Null for human auth. */
    agentId: varchar("agent_id", { length: 20 }),
    amount: integer("amount").notNull(),
    cashedOutAt: doublePrecision("cashed_out_at"),
    payout: integer("payout").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("crash_bets_round_user_idx").on(table.crashRoundId, table.userId),
    uniqueIndex("crash_bets_round_idx").on(table.crashRoundId),
    index("crash_bets_agent_id_idx").on(table.agentId),
  ]
);

export const strategies = pgTable(
  "strategies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameType: varchar("game_type", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    config: jsonb("config").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("strategies_user_game_name_idx").on(
      table.userId,
      table.gameType,
      table.name
    ),
  ]
);

export const faucetGrants = pgTable(
  "faucet_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Agent audit ID when claimed via agent API key. Null for human auth. */
    agentId: varchar("agent_id", { length: 20 }),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("faucet_grants_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
    index("faucet_grants_agent_id_idx").on(table.agentId),
  ]
);

export const stripeEvents = pgTable("stripe_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeEventId: varchar("stripe_event_id", { length: 255 }).notNull().unique(),
  type: varchar("type", { length: 100 }),
  payload: jsonb("payload"),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const deposits = pgTable(
  "deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    credits: integer("credits").notNull(),
    stripeEventId: varchar("stripe_event_id", { length: 255 }),
    stripeSessionId: varchar("stripe_session_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("deposits_user_id_idx").on(table.userId),
    index("deposits_created_at_idx").on(table.createdAt),
  ]
);

export const withdrawalRequests = pgTable(
  "withdrawal_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    wiseEmail: varchar("wise_email", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("withdrawal_requests_user_id_idx").on(table.userId)]
);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 255 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: varchar("token_type", { length: 255 }),
  scope: varchar("scope", { length: 255 }),
  id_token: text("id_token"),
  session_state: varchar("session_state", { length: 255 }),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: varchar("identifier", { length: 255 }).notNull(),
  token: varchar("token", { length: 255 }).notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

// Agent Sessions for AI agents
export const agentSessions = pgTable("agent_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: varchar("agent_id", { length: 100 }).notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  permissions: jsonb("permissions").default(["bet", "read"]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow(),
});

// Strategy code storage for Python strategies
export const strategyCode = pgTable("strategy_code", {
  id: uuid("id").primaryKey().defaultRandom(),
  strategyId: uuid("strategy_id")
    .notNull()
    .references(() => strategies.id, { onDelete: "cascade" }),
  pythonCode: text("python_code"),
  description: text("description"),
  tags: jsonb("tags").default([]),
  isPublic: boolean("is_public").default(false),
  version: integer("version").default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Advanced strategies with rule-based system
export const advancedStrategies = pgTable(
  "advanced_strategies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    // Base configuration
    baseConfig: jsonb("base_config").notNull().$type<{
      amount: number;
      target: number;
      condition: "over" | "under";
    }>(),
    // Rules array
    rules: jsonb("rules").notNull().$type<Array<{
      id: string;
      order: number;
      enabled: boolean;
      name?: string;
      trigger: {
        type: string;
        value?: number;
        value2?: number;
        pattern?: string;
      };
      action: {
        type: string;
        value?: number;
        targetRuleId?: string;
      };
      cooldownRounds?: number;
      maxExecutions?: number;
    }>>(),
    // Global limits
    globalLimits: jsonb("global_limits").$type<{
      maxBet?: number;
      minBet?: number;
      maxRounds?: number;
      stopIfBalanceBelow?: number;
      stopIfBalanceAbove?: number;
      stopOnConsecutiveLosses?: number;
      stopOnConsecutiveWins?: number;
      stopOnProfitAbove?: number;
      stopOnLossAbove?: number;
    }>(),
    executionMode: varchar("execution_mode", { length: 20 }).notNull().default("sequential"),
    isPublic: boolean("is_public").default(false),
    tags: jsonb("tags").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("advanced_strategies_user_name_idx").on(
      table.userId,
      table.name
    ),
  ]
);

// Marketplace: Stripe Connect developers who list strategies for sale
export const marketplaceDevelopers = pgTable(
  "marketplace_developers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeAccountId: varchar("stripe_account_id", { length: 255 }).unique(),
    stripeOnboardingComplete: boolean("stripe_onboarding_complete").default(false),
    subscriberCount: integer("subscriber_count").notNull().default(0),
    rating: doublePrecision("rating"),
    feeTier: varchar("fee_tier", { length: 20 }).notNull().default("newcomer"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("marketplace_developers_user_id_idx").on(table.userId)]
);

// Marketplace strategies (sellable) — developer-set price, platform takes cut
export const marketplaceStrategies = pgTable(
  "marketplace_strategies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => marketplaceDevelopers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    strategySnapshot: jsonb("strategy_snapshot").notNull(),
    priceMonthlyCents: integer("price_monthly_cents").notNull(),
    priceYearlyCents: integer("price_yearly_cents"),
    platformFeePercent: integer("platform_fee_percent").notNull().default(20),
    isActive: boolean("is_active").default(false),
    sharpeRatio: doublePrecision("sharpe_ratio"),
    maxDrawdownPercent: doublePrecision("max_drawdown_percent"),
    winRate: doublePrecision("win_rate"),
    tradeCount: integer("trade_count"),
    paperTradingDays: integer("paper_trading_days"),
    riskLabel: varchar("risk_label", { length: 20 }), // conservative | moderate | aggressive
    liveTrackRecordDays: integer("live_track_record_days"),
    category: varchar("category", { length: 20 }), // crypto | forex | stocks | futures | options
    timeframe: varchar("timeframe", { length: 20 }), // scalping | day | swing
    parentStrategyId: uuid("parent_strategy_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("marketplace_strategies_developer_id_idx").on(table.developerId),
    index("marketplace_strategies_is_active_idx").on(table.isActive),
    index("marketplace_strategies_parent_id_idx").on(table.parentStrategyId),
  ]
);

// Subscriptions: who bought which strategy
export const marketplaceSubscriptions = pgTable(
  "marketplace_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => marketplaceStrategies.id, { onDelete: "restrict" }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }).unique(),
    status: varchar("status", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("marketplace_subscriptions_user_id_idx").on(table.userId),
    index("marketplace_subscriptions_strategy_id_idx").on(table.strategyId),
  ]
);

// AI strategy harvest — captures every strategy AI agents create or run, for data/training
export const aiStrategyHarvest = pgTable(
  "ai_strategy_harvest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 20 }).notNull(),
    source: varchar("source", { length: 10 }).notNull(), // "create" | "run"
    strategyType: varchar("strategy_type", { length: 12 }).notNull(), // "advanced" | "basic"
    strategySnapshot: jsonb("strategy_snapshot").notNull(),
    strategyId: uuid("strategy_id"), // advanced_strategies.id or strategies.id when saved
    executionOutcome: jsonb("execution_outcome").$type<{
      sessionPnl?: number;
      roundsPlayed?: number;
      totalWins?: number;
      totalLosses?: number;
      winRate?: number;
      stoppedReason?: string;
    }>(),
    harvestedAt: timestamp("harvested_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("ai_strategy_harvest_agent_id_idx").on(table.agentId),
    index("ai_strategy_harvest_harvested_at_idx").on(table.harvestedAt),
    index("ai_strategy_harvest_strategy_type_idx").on(table.strategyType),
  ]
);

// Strategy performance snapshots — for charts and historical metrics
export const strategyPerformanceSnapshots = pgTable(
  "strategy_performance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => marketplaceStrategies.id, { onDelete: "cascade" }),
    sharpeRatio: doublePrecision("sharpe_ratio"),
    maxDrawdownPercent: doublePrecision("max_drawdown_percent"),
    winRate: doublePrecision("win_rate"),
    tradeCount: integer("trade_count").notNull().default(0),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("strategy_performance_snapshots_strategy_id_idx").on(table.strategyId),
  ]
);

// AI tournament sessions — spectator AI vs AI battles
export const aiTournamentSessions = pgTable(
  "ai_tournament_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | running | completed
    winnerParticipantId: uuid("winner_participant_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("ai_tournament_sessions_status_idx").on(table.status)]
);

// AI tournament participants — each AI agent in a tournament
export const aiTournamentParticipants = pgTable(
  "ai_tournament_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => aiTournamentSessions.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 20 }).notNull(),
    strategySnapshot: jsonb("strategy_snapshot").notNull(),
    finalPnL: doublePrecision("final_pnl"),
    finalSharpe: doublePrecision("final_sharpe"),
    rank: integer("rank"),
  },
  (table) => [
    index("ai_tournament_participants_session_id_idx").on(table.sessionId),
  ]
);

// User signal delivery preferences — Discord, webhook, email
export const userSignalPreferences = pgTable(
  "user_signal_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    discordWebhookUrl: text("discord_webhook_url"),
    email: varchar("email", { length: 255 }),
    webhookUrl: text("webhook_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("user_signal_preferences_user_id_idx").on(table.userId)]
);

// ANS (Agent Name Service) — .xpersona.agent domains
export const ansDomains = pgTable(
  "ans_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 63 }).notNull().unique(),
    fullDomain: varchar("full_domain", { length: 255 }).notNull().unique(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    agentCard: jsonb("agent_card").$type<{
      name?: string;
      description?: string;
      endpoint?: string;
      capabilities?: string[];
      protocols?: string[];
    }>(),
    agentCardVersion: varchar("agent_card_version", { length: 16 }).default("1.0"),
    publicKey: text("public_key"),
    /** Encrypted at rest with MASTER_ENCRYPTION_KEY. */
    privateKeyEncrypted: text("private_key_encrypted"),
    verified: boolean("verified").default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    status: varchar("status", { length: 24 }).notNull().default("PENDING_VERIFICATION"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("ans_domains_name_idx").on(table.name),
    index("ans_domains_owner_id_idx").on(table.ownerId),
    index("ans_domains_status_idx").on(table.status),
    index("ans_domains_expires_at_idx").on(table.expiresAt),
  ]
);

// ANS subscriptions — Stripe subscription lifecycle for .agent domains
export const ansSubscriptions = pgTable(
  "ans_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }).notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => ansDomains.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("ans_subscriptions_stripe_id_idx").on(table.stripeSubscriptionId),
    index("ans_subscriptions_user_id_idx").on(table.userId),
    index("ans_subscriptions_domain_id_idx").on(table.domainId),
    index("ans_subscriptions_status_idx").on(table.status),
  ]
);

// Signal delivery audit trail
export const signalDeliveryLogs = pgTable(
  "signal_delivery_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => marketplaceStrategies.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    channel: varchar("channel", { length: 30 }).notNull(), // discord | email | webhook
    payload: jsonb("payload"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("signal_delivery_logs_strategy_id_idx").on(table.strategyId),
    index("signal_delivery_logs_user_id_idx").on(table.userId),
  ]
);

// Reliability: agent run telemetry (machine-readable observability)
export const gpgTaskClusters = pgTable(
  "gpg_task_clusters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 191 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    normalizedLabel: varchar("normalized_label", { length: 255 }).notNull(),
    signatureHash: varchar("signature_hash", { length: 64 }).notNull().unique(),
    taskType: varchar("task_type", { length: 32 }).notNull().default("general"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    embedding: jsonb("embedding").$type<number[]>(),
    volume30d: integer("volume_30d").notNull().default(0),
    medianBudgetUsd: doublePrecision("median_budget_usd"),
    runCountTotal: integer("run_count_total").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("gpg_task_clusters_slug_idx").on(table.slug),
    uniqueIndex("gpg_task_clusters_signature_hash_idx").on(table.signatureHash),
    index("gpg_task_clusters_task_type_idx").on(table.taskType),
    index("gpg_task_clusters_volume_30d_idx").on(table.volume30d),
  ]
);

export const gpgTaskSignatures = pgTable(
  "gpg_task_signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawText: text("raw_text").notNull(),
    normalizedText: text("normalized_text").notNull(),
    textHash: varchar("text_hash", { length: 64 }).notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    embedding: jsonb("embedding").$type<number[]>(),
    taskType: varchar("task_type", { length: 32 }).notNull().default("general"),
    difficulty: integer("difficulty"),
    riskLevel: integer("risk_level"),
    clusterId: uuid("cluster_id").references(() => gpgTaskClusters.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("gpg_task_signatures_cluster_id_idx").on(table.clusterId),
    index("gpg_task_signatures_text_hash_idx").on(table.textHash),
    index("gpg_task_signatures_task_type_idx").on(table.taskType),
  ]
);

export const gpgAgentClusterStats = pgTable(
  "gpg_agent_cluster_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    clusterId: uuid("cluster_id")
      .notNull()
      .references(() => gpgTaskClusters.id, { onDelete: "cascade" }),
    successRate30d: doublePrecision("success_rate_30d").notNull().default(0),
    failureRate30d: doublePrecision("failure_rate_30d").notNull().default(0),
    disputeRate90d: doublePrecision("dispute_rate_90d").notNull().default(0),
    avgQuality30d: doublePrecision("avg_quality_30d").notNull().default(0),
    calibError30d: doublePrecision("calib_error_30d").notNull().default(0),
    p50LatencyMs30d: doublePrecision("p50_latency_ms_30d").notNull().default(0),
    p95LatencyMs30d: doublePrecision("p95_latency_ms_30d").notNull().default(0),
    avgCost30d: doublePrecision("avg_cost_30d").notNull().default(0),
    runCount30d: integer("run_count_30d").notNull().default(0),
    verifiedRunCount30d: integer("verified_run_count_30d").notNull().default(0),
    bayesSuccess30d: doublePrecision("bayes_success_30d").notNull().default(0),
    riskScore30d: doublePrecision("risk_score_30d").notNull().default(1),
    lastWindowStart: timestamp("last_window_start", { withTimezone: true }),
    lastWindowEnd: timestamp("last_window_end", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("gpg_agent_cluster_stats_agent_cluster_idx").on(table.agentId, table.clusterId),
    index("gpg_agent_cluster_stats_cluster_idx").on(table.clusterId),
    index("gpg_agent_cluster_stats_agent_idx").on(table.agentId),
    index("gpg_agent_cluster_stats_bayes_idx").on(table.bayesSuccess30d),
  ]
);

export const gpgPipelineRuns = pgTable(
  "gpg_pipeline_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: varchar("job_id", { length: 64 }),
    clusterId: uuid("cluster_id").references(() => gpgTaskClusters.id, { onDelete: "set null" }),
    agentPath: jsonb("agent_path").$type<string[]>().notNull().default([]),
    pathHash: varchar("path_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    qualityScore: doublePrecision("quality_score"),
    confidence: doublePrecision("confidence"),
    failureType: varchar("failure_type", { length: 32 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("gpg_pipeline_runs_cluster_idx").on(table.clusterId),
    index("gpg_pipeline_runs_path_hash_idx").on(table.pathHash),
    index("gpg_pipeline_runs_status_idx").on(table.status),
    index("gpg_pipeline_runs_created_idx").on(table.createdAt),
  ]
);

export const gpgPipelineStats = pgTable(
  "gpg_pipeline_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clusterId: uuid("cluster_id")
      .notNull()
      .references(() => gpgTaskClusters.id, { onDelete: "cascade" }),
    pathHash: varchar("path_hash", { length: 64 }).notNull(),
    agentPath: jsonb("agent_path").$type<string[]>().notNull().default([]),
    successRate30d: doublePrecision("success_rate_30d").notNull().default(0),
    bayesSuccess30d: doublePrecision("bayes_success_30d").notNull().default(0),
    p50LatencyMs30d: doublePrecision("p50_latency_ms_30d").notNull().default(0),
    p95LatencyMs30d: doublePrecision("p95_latency_ms_30d").notNull().default(0),
    avgCost30d: doublePrecision("avg_cost_30d").notNull().default(0),
    avgQuality30d: doublePrecision("avg_quality_30d").notNull().default(0),
    runCount30d: integer("run_count_30d").notNull().default(0),
    riskScore30d: doublePrecision("risk_score_30d").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("gpg_pipeline_stats_cluster_path_idx").on(table.clusterId, table.pathHash),
    index("gpg_pipeline_stats_cluster_idx").on(table.clusterId),
    index("gpg_pipeline_stats_bayes_idx").on(table.bayesSuccess30d),
  ]
);

export const gpgAgentCollaborationEdges = pgTable(
  "gpg_agent_collaboration_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromAgentId: uuid("from_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    toAgentId: uuid("to_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    clusterId: uuid("cluster_id").references(() => gpgTaskClusters.id, { onDelete: "set null" }),
    weight30d: integer("weight_30d").notNull().default(0),
    successWeight30d: doublePrecision("success_weight_30d").notNull().default(0),
    failureWeight30d: doublePrecision("failure_weight_30d").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("gpg_agent_collab_from_to_cluster_idx").on(
      table.fromAgentId,
      table.toAgentId,
      table.clusterId
    ),
    index("gpg_agent_collab_from_idx").on(table.fromAgentId),
    index("gpg_agent_collab_to_idx").on(table.toAgentId),
  ]
);

export const gpgClusterTransitionEdges = pgTable(
  "gpg_cluster_transition_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromClusterId: uuid("from_cluster_id")
      .notNull()
      .references(() => gpgTaskClusters.id, { onDelete: "cascade" }),
    toClusterId: uuid("to_cluster_id")
      .notNull()
      .references(() => gpgTaskClusters.id, { onDelete: "cascade" }),
    weight30d: integer("weight_30d").notNull().default(0),
    successWeight30d: doublePrecision("success_weight_30d").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("gpg_cluster_transition_from_to_idx").on(table.fromClusterId, table.toClusterId),
    index("gpg_cluster_transition_from_idx").on(table.fromClusterId),
    index("gpg_cluster_transition_to_idx").on(table.toClusterId),
  ]
);

export const gpgIntegrityFlags = pgTable(
  "gpg_integrity_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    runId: uuid("run_id"),
    pipelineRunId: uuid("pipeline_run_id").references(() => gpgPipelineRuns.id, { onDelete: "set null" }),
    clusterId: uuid("cluster_id").references(() => gpgTaskClusters.id, { onDelete: "set null" }),
    flagType: varchar("flag_type", { length: 40 }).notNull(),
    reason: text("reason"),
    severity: integer("severity").notNull().default(1),
    score: doublePrecision("score"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    isResolved: boolean("is_resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("gpg_integrity_flags_agent_idx").on(table.agentId),
    index("gpg_integrity_flags_run_idx").on(table.runId),
    index("gpg_integrity_flags_pipeline_idx").on(table.pipelineRunId),
    index("gpg_integrity_flags_resolved_idx").on(table.isResolved),
    index("gpg_integrity_flags_type_idx").on(table.flagType),
  ]
);

export const gpgIngestIdempotency = pgTable(
  "gpg_ingest_idempotency",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpoint: varchar("endpoint", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("gpg_ingest_idempotency_endpoint_key_idx").on(
      table.endpoint,
      table.idempotencyKey
    ),
    index("gpg_ingest_idempotency_agent_idx").on(table.agentId),
    index("gpg_ingest_idempotency_created_idx").on(table.createdAt),
  ]
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 64 }),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    outputHash: varchar("output_hash", { length: 64 }),
    status: varchar("status", { length: 16 }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    confidence: doublePrecision("confidence"),
    hallucinationScore: doublePrecision("hallucination_score"),
    failureType: varchar("failure_type", { length: 32 }),
    failureDetails: jsonb("failure_details"),
    modelUsed: varchar("model_used", { length: 64 }).notNull(),
    tokensInput: integer("tokens_input"),
    tokensOutput: integer("tokens_output"),
    clusterId: uuid("cluster_id").references(() => gpgTaskClusters.id, { onDelete: "set null" }),
    taskSignatureId: uuid("task_signature_id").references(() => gpgTaskSignatures.id, {
      onDelete: "set null",
    }),
    pipelineRunId: uuid("pipeline_run_id").references(() => gpgPipelineRuns.id, {
      onDelete: "set null",
    }),
    pipelineStep: integer("pipeline_step"),
    isVerified: boolean("is_verified").notNull().default(false),
    ingestIdempotencyKey: varchar("ingest_idempotency_key", { length: 128 }),
    ingestKeyId: varchar("ingest_key_id", { length: 64 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    trace: jsonb("trace").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_runs_agent_id_idx").on(table.agentId),
    index("agent_runs_status_idx").on(table.status),
    index("agent_runs_started_at_idx").on(table.startedAt),
    index("agent_runs_cluster_id_idx").on(table.clusterId),
    index("agent_runs_task_signature_id_idx").on(table.taskSignatureId),
    index("agent_runs_pipeline_run_id_idx").on(table.pipelineRunId),
    index("agent_runs_verified_idx").on(table.isVerified),
  ]
);

export const agentMetrics = pgTable(
  "agent_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .unique()
      .references(() => agents.id, { onDelete: "cascade" }),
    successRate: doublePrecision("success_rate").notNull().default(0),
    avgLatencyMs: doublePrecision("avg_latency_ms").notNull().default(0),
    avgCostUsd: doublePrecision("avg_cost_usd").notNull().default(0),
    hallucinationRate: doublePrecision("hallucination_rate").notNull().default(0),
    retryRate: doublePrecision("retry_rate").notNull().default(0),
    disputeRate: doublePrecision("dispute_rate").notNull().default(0),
    p50Latency: doublePrecision("p50_latency").notNull().default(0),
    p95Latency: doublePrecision("p95_latency").notNull().default(0),
    lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("agent_metrics_agent_id_idx").on(table.agentId)]
);

export const failurePatterns = pgTable(
  "failure_patterns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    frequency: integer("frequency").notNull().default(0),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("failure_patterns_agent_id_idx").on(table.agentId),
    uniqueIndex("failure_patterns_agent_type_idx").on(table.agentId, table.type),
  ]
);

export const agentBenchmarkResults = pgTable(
  "agent_benchmark_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    suiteName: varchar("suite_name", { length: 64 }).notNull(),
    score: doublePrecision("score").notNull().default(0),
    accuracy: doublePrecision("accuracy"),
    latencyMs: doublePrecision("latency_ms"),
    costUsd: doublePrecision("cost_usd"),
    safetyViolations: integer("safety_violations").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_benchmark_results_agent_id_idx").on(table.agentId),
    index("agent_benchmark_results_suite_idx").on(table.suiteName),
  ]
);

// Aggregated search queries for trending/popular suggestions
export const searchQueries = pgTable(
  "search_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    query: varchar("query", { length: 255 }).notNull(),
    normalizedQuery: varchar("normalized_query", { length: 255 }).notNull(),
    count: integer("count").notNull().default(1),
    lastSearchedAt: timestamp("last_searched_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("search_queries_normalized_idx").on(table.normalizedQuery),
    index("search_queries_count_idx").on(table.count),
  ]
);

// Economy jobs: core lifecycle entity for paid hiring.
export const economyJobs = pgTable(
  "economy_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    workerDeveloperId: uuid("worker_developer_id").references(
      () => marketplaceDevelopers.id,
      { onDelete: "restrict" }
    ),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    requirements: jsonb("requirements").$type<Record<string, unknown>>(),
    budgetCents: integer("budget_cents").notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    status: varchar("status", { length: 24 }).notNull().default("POSTED"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("economy_jobs_client_created_idx").on(table.clientUserId, table.createdAt),
    index("economy_jobs_worker_status_idx").on(table.workerDeveloperId, table.status),
    index("economy_jobs_status_posted_idx").on(table.status, table.postedAt),
  ]
);

export const economyEscrows = pgTable(
  "economy_escrows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .unique()
      .references(() => economyJobs.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 24 }).notNull().default("PENDING"),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
    fundedAt: timestamp("funded_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("economy_escrows_job_id_idx").on(table.jobId),
    index("economy_escrows_stripe_pi_idx").on(table.stripePaymentIntentId),
  ]
);

export const economyTransactions = pgTable(
  "economy_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => economyJobs.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 24 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("PENDING"),
    amountCents: integer("amount_cents").notNull(),
    feeCents: integer("fee_cents").notNull().default(0),
    netAmountCents: integer("net_amount_cents").notNull(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
    stripeRefundId: varchar("stripe_refund_id", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("economy_transactions_job_id_idx").on(table.jobId),
    index("economy_transactions_type_created_idx").on(table.type, table.createdAt),
  ]
);

export const economyEscrowReleases = pgTable(
  "economy_escrow_releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escrowId: uuid("escrow_id")
      .notNull()
      .references(() => economyEscrows.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => economyTransactions.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    reason: varchar("reason", { length: 64 }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("economy_escrow_releases_escrow_idx").on(table.escrowId)]
);

export const economyDeliverables = pgTable(
  "economy_deliverables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => economyJobs.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    deliverableType: varchar("deliverable_type", { length: 24 }).notNull().default("DATA"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    fileUrl: text("file_url"),
    textContent: text("text_content"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("economy_deliverables_job_id_idx").on(table.jobId)]
);

export const economyJobMessages = pgTable(
  "economy_job_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => economyJobs.id, { onDelete: "cascade" }),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    senderDeveloperId: uuid("sender_developer_id").references(
      () => marketplaceDevelopers.id,
      { onDelete: "set null" }
    ),
    senderRole: varchar("sender_role", { length: 24 }).notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("economy_job_messages_job_created_idx").on(table.jobId, table.createdAt)]
);

// Search engine tables - re-exported from search-schema
export {
  agents,
  agentMediaAssets,
  mediaWebFrontier,
  agentClaims,
  agentCustomizations,
  agentCustomizationVersions,
  crawlFrontier,
  crawlJobs,
  crawlCheckpoints,
  searchClicks,
  agentEmbeddings,
  searchOutcomes,
  agentExecutionMetrics,
  agentCapabilityContracts,
  agentCapabilityHandshakes,
  trustReceipts,
  agentReputationSnapshots,
} from "./search-schema";
