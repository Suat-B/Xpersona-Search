CREATE TABLE "agent_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"verification_method" varchar(32) NOT NULL,
	"verification_token" varchar(128) NOT NULL,
	"verification_data" jsonb,
	"verified_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"review_note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crawl_frontier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" varchar(2048) NOT NULL,
	"discovered_from" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "crawl_frontier_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "search_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" varchar(255) NOT NULL,
	"normalized_query" varchar(255) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"last_searched_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "canonical_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "aliases" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "claimed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "claim_status" varchar(24) DEFAULT 'UNCLAIMED' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "owner_overrides" jsonb;--> statement-breakpoint
CREATE INDEX "agent_claims_agent_id_idx" ON "agent_claims" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_claims_user_id_idx" ON "agent_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_claims_status_idx" ON "agent_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crawl_frontier_status_idx" ON "crawl_frontier" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crawl_frontier_priority_idx" ON "crawl_frontier" USING btree ("priority");--> statement-breakpoint
CREATE UNIQUE INDEX "search_queries_normalized_idx" ON "search_queries" USING btree ("normalized_query");--> statement-breakpoint
CREATE INDEX "search_queries_count_idx" ON "search_queries" USING btree ("count");--> statement-breakpoint
CREATE INDEX "agents_claimed_by_user_id_idx" ON "agents" USING btree ("claimed_by_user_id");--> statement-breakpoint
CREATE INDEX "agents_claim_status_idx" ON "agents" USING btree ("claim_status");