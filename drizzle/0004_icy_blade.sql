CREATE TABLE "ai_strategy_harvest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" varchar(20) NOT NULL,
	"source" varchar(10) NOT NULL,
	"strategy_type" varchar(12) NOT NULL,
	"strategy_snapshot" jsonb NOT NULL,
	"strategy_id" uuid,
	"execution_outcome" jsonb,
	"harvested_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ai_strategy_harvest" ADD CONSTRAINT "ai_strategy_harvest_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_strategy_harvest_agent_id_idx" ON "ai_strategy_harvest" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "ai_strategy_harvest_harvested_at_idx" ON "ai_strategy_harvest" USING btree ("harvested_at");--> statement-breakpoint
CREATE INDEX "ai_strategy_harvest_strategy_type_idx" ON "ai_strategy_harvest" USING btree ("strategy_type");