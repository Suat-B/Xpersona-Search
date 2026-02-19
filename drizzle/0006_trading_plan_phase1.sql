CREATE TABLE "ai_tournament_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"agent_id" varchar(20) NOT NULL,
	"strategy_snapshot" jsonb NOT NULL,
	"final_pnl" double precision,
	"final_sharpe" double precision,
	"rank" integer
);
--> statement-breakpoint
CREATE TABLE "ai_tournament_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"winner_participant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "signal_delivery_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" varchar(30) NOT NULL,
	"payload" jsonb,
	"delivered_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategy_performance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"sharpe_ratio" double precision,
	"max_drawdown_percent" double precision,
	"win_rate" double precision,
	"trade_count" integer DEFAULT 0 NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_signal_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"discord_webhook_url" text,
	"email" varchar(255),
	"webhook_url" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD COLUMN "sharpe_ratio" double precision;--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD COLUMN "max_drawdown_percent" double precision;--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD COLUMN "win_rate" double precision;--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD COLUMN "trade_count" integer;--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD COLUMN "paper_trading_days" integer;--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD COLUMN "risk_label" varchar(20);--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD COLUMN "live_track_record_days" integer;--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD COLUMN "category" varchar(20);--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD COLUMN "timeframe" varchar(20);--> statement-breakpoint
ALTER TABLE "ai_tournament_participants" ADD CONSTRAINT "ai_tournament_participants_session_id_ai_tournament_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_tournament_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_delivery_logs" ADD CONSTRAINT "signal_delivery_logs_strategy_id_marketplace_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."marketplace_strategies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_delivery_logs" ADD CONSTRAINT "signal_delivery_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_performance_snapshots" ADD CONSTRAINT "strategy_performance_snapshots_strategy_id_marketplace_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."marketplace_strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_signal_preferences" ADD CONSTRAINT "user_signal_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_tournament_participants_session_id_idx" ON "ai_tournament_participants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ai_tournament_sessions_status_idx" ON "ai_tournament_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "signal_delivery_logs_strategy_id_idx" ON "signal_delivery_logs" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "signal_delivery_logs_user_id_idx" ON "signal_delivery_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "strategy_performance_snapshots_strategy_id_idx" ON "strategy_performance_snapshots" USING btree ("strategy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_signal_preferences_user_id_idx" ON "user_signal_preferences" USING btree ("user_id");