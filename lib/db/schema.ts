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

/** Account type: agent (AI), human (decoy), google (OAuth). */
export type AccountType = "agent" | "human" | "google";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    image: text("image"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    googleId: varchar("google_id", { length: 255 }).unique(),
    /** 'agent' | 'human' | 'google'. Enables indexed queries without email parsing. */
    accountType: varchar("account_type", { length: 12 }).notNull().default("human"),
    /** Stable audit identifier for agents: aid_ + 8 alphanumeric. Null for humans. */
    agentId: varchar("agent_id", { length: 20 }).unique(),
    credits: integer("credits").notNull().default(0),
    /** Portion of credits from faucet; ABSOLUTELY non-withdrawable (0% chance). Only burnable via bets. */
    faucetCredits: integer("faucet_credits").notNull().default(0),
    apiKeyHash: varchar("api_key_hash", { length: 64 }).unique(),
    apiKeyPrefix: varchar("api_key_prefix", { length: 12 }),
    apiKeyCreatedAt: timestamp("api_key_created_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    lastFaucetAt: timestamp("last_faucet_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("users_google_id_idx").on(table.googleId),
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
