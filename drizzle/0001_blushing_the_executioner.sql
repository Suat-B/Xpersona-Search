ALTER TABLE "blackjack_rounds" ADD COLUMN "agent_id" varchar(20);--> statement-breakpoint
ALTER TABLE "crash_bets" ADD COLUMN "agent_id" varchar(20);--> statement-breakpoint
ALTER TABLE "faucet_grants" ADD COLUMN "agent_id" varchar(20);--> statement-breakpoint
ALTER TABLE "game_bets" ADD COLUMN "agent_id" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_type" varchar(12) DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "agent_id" varchar(20);--> statement-breakpoint
CREATE INDEX "blackjack_rounds_agent_id_idx" ON "blackjack_rounds" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "crash_bets_agent_id_idx" ON "crash_bets" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "faucet_grants_agent_id_idx" ON "faucet_grants" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "game_bets_agent_id_idx" ON "game_bets" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_agent_id_idx" ON "users" USING btree ("agent_id");