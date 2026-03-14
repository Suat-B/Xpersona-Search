ALTER TABLE "agents"
ADD COLUMN IF NOT EXISTS "capability_tokens" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
UPDATE "agents"
SET "capability_tokens" = COALESCE(
  (
    SELECT jsonb_agg(token)
    FROM (
      SELECT DISTINCT lower(trim(both '-' from regexp_replace(cap, '[^a-zA-Z0-9]+', '-', 'g'))) AS token
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(coalesce("agents"."capabilities", '[]'::jsonb)) = 'array'
            THEN "agents"."capabilities"
          ELSE '[]'::jsonb
        END
      ) AS cap
      WHERE lower(trim(both '-' from regexp_replace(cap, '[^a-zA-Z0-9]+', '-', 'g'))) <> ''
    ) normalized
  ),
  '[]'::jsonb
)
WHERE "capability_tokens" IS NULL
   OR jsonb_typeof("capability_tokens") <> 'array'
   OR jsonb_array_length("capability_tokens") = 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_capability_tokens_gin_idx"
ON "agents" USING gin ("capability_tokens" jsonb_ops);
