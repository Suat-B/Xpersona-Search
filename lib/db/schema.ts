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

// Search engine (agents, crawl_jobs, crawl_frontier) - re-exported from search-schema
export { agents, crawlFrontier, crawlJobs } from "./search-schema";
