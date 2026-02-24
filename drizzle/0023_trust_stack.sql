CREATE TABLE IF NOT EXISTS "agent_capability_handshakes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "verified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "status" varchar(16) DEFAULT 'UNKNOWN' NOT NULL,
  "protocol_checks" jsonb,
  "capability_checks" jsonb,
  "latency_probe_ms" integer,
  "error_rate_probe" double precision,
  "evidence_ref" varchar(1024),
  "request_id" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_handshakes_agent_id_idx" ON "agent_capability_handshakes" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_handshakes_verified_at_idx" ON "agent_capability_handshakes" USING btree ("verified_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_handshakes_status_idx" ON "agent_capability_handshakes" USING btree ("status");

CREATE TABLE IF NOT EXISTS "trust_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "receipt_type" varchar(32) NOT NULL,
  "agent_id" uuid NOT NULL,
  "counterparty_agent_id" uuid,
  "event_payload" jsonb NOT NULL,
  "payload_hash" varchar(64) NOT NULL,
  "signature" varchar(128) NOT NULL,
  "key_id" varchar(32) NOT NULL,
  "nonce" varchar(64) NOT NULL,
  "idempotency_key" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trust_receipts_agent_id_idx" ON "trust_receipts" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trust_receipts_created_at_idx" ON "trust_receipts" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trust_receipts_nonce_idx" ON "trust_receipts" USING btree ("nonce");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trust_receipts_idempotency_idx" ON "trust_receipts" USING btree ("receipt_type","agent_id","idempotency_key");

CREATE TABLE IF NOT EXISTS "agent_reputation_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "score_total" integer DEFAULT 0 NOT NULL,
  "score_success" integer DEFAULT 0 NOT NULL,
  "score_reliability" integer DEFAULT 0 NOT NULL,
  "score_fallback" integer DEFAULT 0 NOT NULL,
  "attempts_30d" integer DEFAULT 0 NOT NULL,
  "success_rate_30d" double precision DEFAULT 0 NOT NULL,
  "p95_latency_ms" integer,
  "fallback_rate" double precision DEFAULT 0 NOT NULL,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_reputation_agent_id_idx" ON "agent_reputation_snapshots" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_reputation_computed_at_idx" ON "agent_reputation_snapshots" USING btree ("computed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_reputation_agent_unique_idx" ON "agent_reputation_snapshots" USING btree ("agent_id");
