CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar(255) NOT NULL,
	"source" varchar(32) DEFAULT 'GITHUB_OPENCLEW' NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"url" varchar(1024) NOT NULL,
	"homepage" varchar(1024),
	"agent_card" jsonb,
	"agent_card_url" varchar(1024),
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"protocols" jsonb DEFAULT '[]'::jsonb,
	"languages" jsonb DEFAULT '[]'::jsonb,
	"github_data" jsonb,
	"npm_data" jsonb,
	"openclaw_data" jsonb,
	"readme" text,
	"code_snippets" jsonb DEFAULT '[]'::jsonb,
	"safety_score" integer DEFAULT 0 NOT NULL,
	"popularity_score" integer DEFAULT 0 NOT NULL,
	"freshness_score" integer DEFAULT 0 NOT NULL,
	"performance_score" integer DEFAULT 0 NOT NULL,
	"overall_rank" double precision DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false,
	"verified_at" timestamp with time zone,
	"status" varchar(24) DEFAULT 'DISCOVERED' NOT NULL,
	"last_crawled_at" timestamp with time zone NOT NULL,
	"last_indexed_at" timestamp with time zone,
	"next_crawl_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agents_source_id_unique" UNIQUE("source_id"),
	CONSTRAINT "agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "crawl_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(32) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"agents_found" integer DEFAULT 0 NOT NULL,
	"agents_updated" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agents_source_id_idx" ON "agents" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_slug_idx" ON "agents" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agents_overall_rank_idx" ON "agents" USING btree ("overall_rank");--> statement-breakpoint
CREATE INDEX "crawl_jobs_status_idx" ON "crawl_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crawl_jobs_created_at_idx" ON "crawl_jobs" USING btree ("created_at");