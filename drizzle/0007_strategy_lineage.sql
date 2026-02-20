ALTER TABLE "marketplace_strategies" ADD COLUMN IF NOT EXISTS "parent_strategy_id" uuid;
CREATE INDEX IF NOT EXISTS "marketplace_strategies_parent_id_idx" ON "marketplace_strategies" ("parent_strategy_id");
