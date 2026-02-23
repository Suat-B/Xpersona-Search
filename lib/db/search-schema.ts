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
} from "drizzle-orm/pg-core";

/** Search engine: crawled AI agents from GitHub, etc. */
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: varchar("source_id", { length: 255 }).notNull().unique(),
    source: varchar("source", { length: 32 }).notNull().default("GITHUB_OPENCLEW"),

    // Identity
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    url: varchar("url", { length: 1024 }).notNull(),
    homepage: varchar("homepage", { length: 1024 }),

    // Agent Card (A2A compatible)
    agentCard: jsonb("agent_card").$type<Record<string, unknown>>(),
    agentCardUrl: varchar("agent_card_url", { length: 1024 }),

    // Capabilities
    capabilities: jsonb("capabilities").$type<string[]>().default([]),
    protocols: jsonb("protocols").$type<string[]>().default([]),
    languages: jsonb("languages").$type<string[]>().default([]),

    // Cross-source deduplication
    canonicalAgentId: uuid("canonical_agent_id"),
    aliases: jsonb("aliases").$type<string[]>().default([]),

    // Source-specific data
    githubData: jsonb("github_data").$type<{
      stars?: number;
      forks?: number;
      lastCommit?: string;
      defaultBranch?: string;
    }>(),
    npmData: jsonb("npm_data").$type<Record<string, unknown>>(),
    openclawData: jsonb("openclaw_data").$type<Record<string, unknown>>(),

    // Content for search
    readme: text("readme"),
    codeSnippets: jsonb("code_snippets").$type<string[]>().default([]),

    // Rankings
    safetyScore: integer("safety_score").notNull().default(0),
    popularityScore: integer("popularity_score").notNull().default(0),
    freshnessScore: integer("freshness_score").notNull().default(0),
    performanceScore: integer("performance_score").notNull().default(0),
    overallRank: doublePrecision("overall_rank").notNull().default(0),

    verified: boolean("verified").default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    status: varchar("status", { length: 24 }).notNull().default("DISCOVERED"),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }).notNull(),
    lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
    nextCrawlAt: timestamp("next_crawl_at", { withTimezone: true }),

    // Claim system
    claimedByUserId: uuid("claimed_by_user_id"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimStatus: varchar("claim_status", { length: 24 }).notNull().default("UNCLAIMED"),
    ownerOverrides: jsonb("owner_overrides").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("agents_source_id_idx").on(table.sourceId),
    uniqueIndex("agents_slug_idx").on(table.slug),
    index("agents_status_idx").on(table.status),
    index("agents_overall_rank_idx").on(table.overallRank),
    index("agents_claimed_by_user_id_idx").on(table.claimedByUserId),
    index("agents_claim_status_idx").on(table.claimStatus),
  ]
);

/** Claim audit trail: every claim attempt for an agent page */
export const agentClaims = pgTable(
  "agent_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    userId: uuid("user_id").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("PENDING"),
    verificationMethod: varchar("verification_method", { length: 32 }).notNull(),
    verificationToken: varchar("verification_token", { length: 128 }).notNull(),
    verificationData: jsonb("verification_data").$type<Record<string, unknown>>(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id"),
    reviewNote: text("review_note"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("agent_claims_agent_id_idx").on(table.agentId),
    index("agent_claims_user_id_idx").on(table.userId),
    index("agent_claims_status_idx").on(table.status),
  ]
);

/** Search engine: URL frontier for recursive discovery */
export const crawlFrontier = pgTable(
  "crawl_frontier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: varchar("url", { length: 2048 }).notNull().unique(),
    discoveredFrom: uuid("discovered_from"),
    priority: integer("priority").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("crawl_frontier_status_idx").on(table.status),
    index("crawl_frontier_priority_idx").on(table.priority),
  ]
);

/** Search engine: crawl job tracking */
export const crawlJobs = pgTable(
  "crawl_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 32 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    agentsFound: integer("agents_found").notNull().default(0),
    agentsUpdated: integer("agents_updated").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("crawl_jobs_status_idx").on(table.status),
    index("crawl_jobs_created_at_idx").on(table.createdAt),
  ]
);

/** Click tracking for learning-to-rank CTR signals */
export const searchClicks = pgTable(
  "search_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queryHash: varchar("query_hash", { length: 32 }).notNull(),
    agentId: uuid("agent_id").notNull(),
    position: integer("position").notNull().default(0),
    userId: uuid("user_id"),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("search_clicks_query_hash_idx").on(table.queryHash),
    index("search_clicks_agent_id_idx").on(table.agentId),
    index("search_clicks_clicked_at_idx").on(table.clickedAt),
    index("search_clicks_agent_date_idx").on(table.agentId, table.clickedAt),
  ]
);
