CREATE TABLE "ans_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(63) NOT NULL,
	"full_domain" varchar(255) NOT NULL,
	"owner_id" uuid NOT NULL,
	"agent_card" jsonb,
	"public_key" text,
	"status" varchar(24) DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ans_domains_name_unique" UNIQUE("name"),
	CONSTRAINT "ans_domains_full_domain_unique" UNIQUE("full_domain")
);
--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD COLUMN "parent_strategy_id" uuid;--> statement-breakpoint
ALTER TABLE "ans_domains" ADD CONSTRAINT "ans_domains_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ans_domains_name_idx" ON "ans_domains" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ans_domains_owner_id_idx" ON "ans_domains" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "marketplace_strategies_parent_id_idx" ON "marketplace_strategies" USING btree ("parent_strategy_id");