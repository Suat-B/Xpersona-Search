CREATE TABLE IF NOT EXISTS "search_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "query" varchar(255) NOT NULL,
  "normalized_query" varchar(255) NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  "last_searched_at" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "search_queries_normalized_idx"
  ON "search_queries" ("normalized_query");

CREATE INDEX IF NOT EXISTS "search_queries_count_idx"
  ON "search_queries" ("count");
