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
  customType,
} from "drizzle-orm/pg-core";

const vector1536 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
});

/** Search engine: crawled AI agents from GitHub, etc. */
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: varchar("source_id", { length: 255 }).notNull().unique(),
    source: varchar("source", { length: 32 }).notNull().default("GITHUB_OPENCLEW"),
    visibility: varchar("visibility", { length: 16 }).notNull().default("PUBLIC"),
    publicSearchable: boolean("public_searchable").notNull().default(true),
    primaryImageUrl: text("primary_image_url"),
    mediaAssetCount: integer("media_asset_count").notNull().default(0),

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
    verificationTier: varchar("verification_tier", { length: 16 })
      .notNull()
      .default("NONE"),
    verificationMethod: varchar("verification_method", { length: 32 }),
    hasCustomPage: boolean("has_custom_page").notNull().default(false),
    customPageUpdatedAt: timestamp("custom_page_updated_at", { withTimezone: true }),
    ownerOverrides: jsonb("owner_overrides").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("agents_source_id_idx").on(table.sourceId),
    uniqueIndex("agents_slug_idx").on(table.slug),
    index("agents_status_idx").on(table.status),
    index("agents_overall_rank_idx").on(table.overallRank),
    index("agents_visibility_idx").on(table.visibility),
    index("agents_public_searchable_idx").on(table.publicSearchable),
    index("agents_primary_image_url_idx").on(table.primaryImageUrl),
    index("agents_media_asset_count_idx").on(table.mediaAssetCount),
    index("agents_claimed_by_user_id_idx").on(table.claimedByUserId),
    index("agents_claim_status_idx").on(table.claimStatus),
    index("agents_verification_tier_idx").on(table.verificationTier),
    index("agents_has_custom_page_idx").on(table.hasCustomPage),
  ]
);

/** Visual and machine-usable media assets discovered for each agent. */
export const agentMediaAssets = pgTable(
  "agent_media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    assetKind: varchar("asset_kind", { length: 16 }).notNull(),
    artifactType: varchar("artifact_type", { length: 32 }),
    url: text("url").notNull(),
    sourcePageUrl: text("source_page_url"),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    mimeType: varchar("mime_type", { length: 128 }),
    width: integer("width"),
    height: integer("height"),
    byteSize: integer("byte_size"),
    title: text("title"),
    caption: text("caption"),
    altText: text("alt_text"),
    contextText: text("context_text"),
    licenseGuess: varchar("license_guess", { length: 64 }),
    crawlDomain: varchar("crawl_domain", { length: 255 }),
    discoveryMethod: varchar("discovery_method", { length: 32 }),
    urlNormHash: varchar("url_norm_hash", { length: 64 }),
    isPublic: boolean("is_public").notNull().default(true),
    isDead: boolean("is_dead").notNull().default(false),
    deadCheckedAt: timestamp("dead_checked_at", { withTimezone: true }),
    qualityScore: integer("quality_score").notNull().default(0),
    safetyScore: integer("safety_score").notNull().default(0),
    rankScore: doublePrecision("rank_score").notNull().default(0),
    crawlStatus: varchar("crawl_status", { length: 20 }).notNull().default("DISCOVERED"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_media_assets_sha_agent_idx").on(table.sha256, table.agentId),
    uniqueIndex("agent_media_assets_url_agent_idx").on(table.url, table.agentId),
    index("agent_media_assets_agent_id_idx").on(table.agentId),
    index("agent_media_assets_asset_kind_idx").on(table.assetKind),
    index("agent_media_assets_artifact_type_idx").on(table.artifactType),
    index("agent_media_assets_quality_score_idx").on(table.qualityScore),
    index("agent_media_assets_rank_score_idx").on(table.rankScore),
    index("agent_media_assets_is_public_idx").on(table.isPublic),
    index("agent_media_assets_domain_source_idx").on(table.crawlDomain, table.source),
    index("agent_media_assets_asset_quality_updated_idx").on(
      table.assetKind,
      table.qualityScore,
      table.updatedAt
    ),
    uniqueIndex("agent_media_assets_url_norm_hash_idx").on(table.urlNormHash, table.agentId),
  ]
);

/** Open-web frontier for large-scale media discovery beyond repo/homepage pages. */
export const mediaWebFrontier = pgTable(
  "media_web_frontier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull().unique(),
    domain: varchar("domain", { length: 255 }).notNull(),
    source: varchar("source", { length: 32 }).notNull().default("WEB"),
    discoveredFrom: text("discovered_from"),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    priority: integer("priority").notNull().default(0),
    lockOwner: varchar("lock_owner", { length: 64 }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("media_web_frontier_status_idx").on(table.status),
    index("media_web_frontier_domain_idx").on(table.domain),
    index("media_web_frontier_priority_idx").on(table.priority),
    index("media_web_frontier_next_attempt_at_idx").on(table.nextAttemptAt),
    index("media_web_frontier_lock_owner_idx").on(table.lockOwner),
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
    resolvedTier: varchar("resolved_tier", { length: 16 }),
    verificationMetadata: jsonb("verification_metadata").$type<Record<string, unknown>>(),
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
    repoFullName: varchar("repo_full_name", { length: 255 }),
    originSource: varchar("origin_source", { length: 64 }),
    discoveryAt: timestamp("discovery_at", { withTimezone: true }).defaultNow(),
    confidence: integer("confidence").notNull().default(0),
    reasons: jsonb("reasons").$type<string[]>().default([]),
    discoveredFrom: uuid("discovered_from"),
    priority: integer("priority").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    lockOwner: varchar("lock_owner", { length: 64 }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("crawl_frontier_status_idx").on(table.status),
    index("crawl_frontier_priority_idx").on(table.priority),
    index("crawl_frontier_confidence_idx").on(table.confidence),
    index("crawl_frontier_repo_full_name_idx").on(table.repoFullName),
    index("crawl_frontier_next_attempt_at_idx").on(table.nextAttemptAt),
  ]
);

/** Claimed owner customization payload for public agent page rendering. */
export const agentCustomizations = pgTable(
  "agent_customizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().unique(),
    status: varchar("status", { length: 16 }).notNull().default("PUBLISHED"),
    customHtml: text("custom_html"),
    customCss: text("custom_css"),
    customJs: text("custom_js"),
    sanitizedHtml: text("sanitized_html"),
    sanitizedCss: text("sanitized_css"),
    sanitizedJs: text("sanitized_js"),
    widgetLayout: jsonb("widget_layout").$type<unknown[]>(),
    editorState: jsonb("editor_state").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("agent_customizations_agent_id_idx").on(table.agentId),
    index("agent_customizations_status_idx").on(table.status),
  ]
);

/** Version history for customization changes and rollback/audit support. */
export const agentCustomizationVersions = pgTable(
  "agent_customization_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customizationId: uuid("customization_id").notNull(),
    version: integer("version").notNull(),
    customHtml: text("custom_html"),
    customCss: text("custom_css"),
    customJs: text("custom_js"),
    widgetLayout: jsonb("widget_layout").$type<unknown[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_customization_versions_unique_idx").on(
      table.customizationId,
      table.version
    ),
    index("agent_customization_versions_customization_id_idx").on(
      table.customizationId
    ),
  ]
);

/** Search engine: crawl job tracking */
export const crawlJobs = pgTable(
  "crawl_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 32 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    workerId: varchar("worker_id", { length: 64 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    finishedReason: varchar("finished_reason", { length: 40 }),
    error: text("error"),
    agentsFound: integer("agents_found").notNull().default(0),
    agentsUpdated: integer("agents_updated").notNull().default(0),
    budgetUsed: integer("budget_used").notNull().default(0),
    timeouts: integer("timeouts").notNull().default(0),
    rateLimits: integer("rate_limits").notNull().default(0),
    githubRequests: integer("github_requests").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    rateLimitWaitMs: integer("rate_limit_wait_ms").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    cursorSnapshot: jsonb("cursor_snapshot").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("crawl_jobs_status_idx").on(table.status),
    index("crawl_jobs_worker_id_idx").on(table.workerId),
    index("crawl_jobs_heartbeat_at_idx").on(table.heartbeatAt),
    index("crawl_jobs_created_at_idx").on(table.createdAt),
  ]
);

/** Durable cursor snapshots for resumable crawlers. */
export const crawlCheckpoints = pgTable(
  "crawl_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 32 }).notNull(),
    mode: varchar("mode", { length: 16 }).notNull().default("backfill"),
    cursor: jsonb("cursor").$type<Record<string, unknown>>().notNull().default({}),
    workerId: varchar("worker_id", { length: 64 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("crawl_checkpoints_source_mode_idx").on(table.source, table.mode),
    index("crawl_checkpoints_worker_id_idx").on(table.workerId),
    index("crawl_checkpoints_updated_at_idx").on(table.updatedAt),
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

/** Semantic embeddings for hybrid retrieval. */
export const agentEmbeddings = pgTable(
  "agent_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    dimensions: integer("dimensions").notNull().default(1536),
    embedding: vector1536("embedding").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_embeddings_agent_provider_model_idx").on(
      table.agentId,
      table.provider,
      table.model
    ),
    index("agent_embeddings_agent_id_idx").on(table.agentId),
    index("agent_embeddings_updated_at_idx").on(table.updatedAt),
  ]
);

/** Anonymous aggregate execution outcomes for ranking quality signals. */
export const searchOutcomes = pgTable(
  "search_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    querySignature: varchar("query_signature", { length: 64 }).notNull(),
    agentId: uuid("agent_id").notNull(),
    taskType: varchar("task_type", { length: 32 }).notNull().default("general"),
    attempts: integer("attempts").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    timeoutCount: integer("timeout_count").notNull().default(0),
    authFailureCount: integer("auth_failure_count").notNull().default(0),
    rateLimitFailureCount: integer("rate_limit_failure_count").notNull().default(0),
    toolErrorCount: integer("tool_error_count").notNull().default(0),
    schemaMismatchCount: integer("schema_mismatch_count").notNull().default(0),
    budgetExceededCount: integer("budget_exceeded_count").notNull().default(0),
    singlePathCount: integer("single_path_count").notNull().default(0),
    delegatedPathCount: integer("delegated_path_count").notNull().default(0),
    bundledPathCount: integer("bundled_path_count").notNull().default(0),
    lastQuery: varchar("last_query", { length: 255 }),
    lastQueryNormalized: varchar("last_query_normalized", { length: 255 }),
    lastOutcomeAt: timestamp("last_outcome_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("search_outcomes_signature_agent_task_idx").on(
      table.querySignature,
      table.agentId,
      table.taskType
    ),
    index("search_outcomes_agent_id_idx").on(table.agentId),
    index("search_outcomes_last_outcome_at_idx").on(table.lastOutcomeAt),
  ]
);

/** Aggregated operational metrics per agent for execute-mode ranking. */
export const agentExecutionMetrics = pgTable(
  "agent_execution_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().unique(),
    observedLatencyMsP50: integer("observed_latency_ms_p50"),
    observedLatencyMsP95: integer("observed_latency_ms_p95"),
    estimatedCostUsd: doublePrecision("estimated_cost_usd"),
    uptime30d: doublePrecision("uptime_30d"),
    rateLimitRpm: integer("rate_limit_rpm"),
    rateLimitBurst: integer("rate_limit_burst"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    verificationSource: varchar("verification_source", { length: 40 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_execution_metrics_agent_id_idx").on(table.agentId),
    index("agent_execution_metrics_updated_at_idx").on(table.updatedAt),
  ]
);

/** Normalized machine-usable contract metadata for execution by AI agents. */
export const agentCapabilityContracts = pgTable(
  "agent_capability_contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().unique(),
    authModes: jsonb("auth_modes").$type<string[]>().notNull().default([]),
    requires: jsonb("requires").$type<string[]>().notNull().default([]),
    forbidden: jsonb("forbidden").$type<string[]>().notNull().default([]),
    dataRegion: varchar("data_region", { length: 16 }),
    inputSchemaRef: varchar("input_schema_ref", { length: 1024 }),
    outputSchemaRef: varchar("output_schema_ref", { length: 1024 }),
    supportsStreaming: boolean("supports_streaming").notNull().default(false),
    supportsMcp: boolean("supports_mcp").notNull().default(false),
    supportsA2a: boolean("supports_a2a").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_capability_contracts_agent_id_idx").on(table.agentId),
    index("agent_capability_contracts_data_region_idx").on(table.dataRegion),
  ]
);

/** Latest capability handshake verification per agent. */
export const agentCapabilityHandshakes = pgTable(
  "agent_capability_handshakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).notNull().default("UNKNOWN"),
    protocolChecks: jsonb("protocol_checks").$type<Record<string, unknown>>(),
    capabilityChecks: jsonb("capability_checks").$type<Record<string, unknown>>(),
    latencyProbeMs: integer("latency_probe_ms"),
    errorRateProbe: doublePrecision("error_rate_probe"),
    evidenceRef: varchar("evidence_ref", { length: 1024 }),
    requestId: varchar("request_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_handshakes_agent_id_idx").on(table.agentId),
    index("agent_handshakes_verified_at_idx").on(table.verifiedAt),
    index("agent_handshakes_status_idx").on(table.status),
  ]
);

/** Signed trust receipts for agent actions. */
export const trustReceipts = pgTable(
  "trust_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptType: varchar("receipt_type", { length: 32 }).notNull(),
    agentId: uuid("agent_id").notNull(),
    counterpartyAgentId: uuid("counterparty_agent_id"),
    eventPayload: jsonb("event_payload").$type<Record<string, unknown>>().notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    signature: varchar("signature", { length: 128 }).notNull(),
    keyId: varchar("key_id", { length: 32 }).notNull(),
    nonce: varchar("nonce", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("trust_receipts_agent_id_idx").on(table.agentId),
    index("trust_receipts_created_at_idx").on(table.createdAt),
    uniqueIndex("trust_receipts_nonce_idx").on(table.nonce),
    uniqueIndex("trust_receipts_idempotency_idx").on(
      table.receiptType,
      table.agentId,
      table.idempotencyKey
    ),
  ]
);

/** Rolling reputation snapshots per agent for trust scoring. */
export const agentReputationSnapshots = pgTable(
  "agent_reputation_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    scoreTotal: integer("score_total").notNull().default(0),
    scoreSuccess: integer("score_success").notNull().default(0),
    scoreReliability: integer("score_reliability").notNull().default(0),
    scoreFallback: integer("score_fallback").notNull().default(0),
    attempts30d: integer("attempts_30d").notNull().default(0),
    successRate30d: doublePrecision("success_rate_30d").notNull().default(0),
    p95LatencyMs: integer("p95_latency_ms"),
    fallbackRate: doublePrecision("fallback_rate").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("agent_reputation_agent_id_idx").on(table.agentId),
    index("agent_reputation_computed_at_idx").on(table.computedAt),
    uniqueIndex("agent_reputation_agent_unique_idx").on(table.agentId),
  ]
);
