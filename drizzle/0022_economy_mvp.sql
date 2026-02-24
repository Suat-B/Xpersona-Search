CREATE TABLE IF NOT EXISTS "economy_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_user_id" uuid NOT NULL,
  "worker_developer_id" uuid,
  "agent_id" uuid,
  "title" varchar(200) NOT NULL,
  "description" text NOT NULL,
  "requirements" jsonb,
  "budget_cents" integer NOT NULL,
  "currency" varchar(10) DEFAULT 'USD' NOT NULL,
  "status" varchar(24) DEFAULT 'POSTED' NOT NULL,
  "deadline_at" timestamp with time zone,
  "posted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "accepted_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "economy_jobs" ADD CONSTRAINT "economy_jobs_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "economy_jobs" ADD CONSTRAINT "economy_jobs_worker_developer_id_marketplace_developers_id_fk" FOREIGN KEY ("worker_developer_id") REFERENCES "public"."marketplace_developers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "economy_jobs" ADD CONSTRAINT "economy_jobs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_jobs_client_created_idx" ON "economy_jobs" USING btree ("client_user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_jobs_worker_status_idx" ON "economy_jobs" USING btree ("worker_developer_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_jobs_status_posted_idx" ON "economy_jobs" USING btree ("status","posted_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "economy_escrows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "status" varchar(24) DEFAULT 'PENDING' NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(10) DEFAULT 'USD' NOT NULL,
  "stripe_payment_intent_id" varchar(255),
  "stripe_checkout_session_id" varchar(255),
  "funded_at" timestamp with time zone,
  "released_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "economy_escrows_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "economy_escrows" ADD CONSTRAINT "economy_escrows_job_id_economy_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."economy_jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_escrows_job_id_idx" ON "economy_escrows" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_escrows_stripe_pi_idx" ON "economy_escrows" USING btree ("stripe_payment_intent_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "economy_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "type" varchar(24) NOT NULL,
  "status" varchar(24) DEFAULT 'PENDING' NOT NULL,
  "amount_cents" integer NOT NULL,
  "fee_cents" integer DEFAULT 0 NOT NULL,
  "net_amount_cents" integer NOT NULL,
  "stripe_payment_intent_id" varchar(255),
  "stripe_transfer_id" varchar(255),
  "stripe_refund_id" varchar(255),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "economy_transactions" ADD CONSTRAINT "economy_transactions_job_id_economy_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."economy_jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_transactions_job_id_idx" ON "economy_transactions" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_transactions_type_created_idx" ON "economy_transactions" USING btree ("type","created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "economy_escrow_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "escrow_id" uuid NOT NULL,
  "transaction_id" uuid NOT NULL,
  "amount_cents" integer NOT NULL,
  "reason" varchar(64) NOT NULL,
  "released_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "economy_escrow_releases" ADD CONSTRAINT "economy_escrow_releases_escrow_id_economy_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."economy_escrows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "economy_escrow_releases" ADD CONSTRAINT "economy_escrow_releases_transaction_id_economy_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."economy_transactions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_escrow_releases_escrow_idx" ON "economy_escrow_releases" USING btree ("escrow_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "economy_deliverables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "title" varchar(200) NOT NULL,
  "deliverable_type" varchar(24) DEFAULT 'DATA' NOT NULL,
  "data" jsonb,
  "file_url" text,
  "text_content" text,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "economy_deliverables" ADD CONSTRAINT "economy_deliverables_job_id_economy_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."economy_jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_deliverables_job_id_idx" ON "economy_deliverables" USING btree ("job_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "economy_job_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "sender_user_id" uuid,
  "sender_developer_id" uuid,
  "sender_role" varchar(24) NOT NULL,
  "content" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "economy_job_messages" ADD CONSTRAINT "economy_job_messages_job_id_economy_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."economy_jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "economy_job_messages" ADD CONSTRAINT "economy_job_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "economy_job_messages" ADD CONSTRAINT "economy_job_messages_sender_developer_id_marketplace_developers_id_fk" FOREIGN KEY ("sender_developer_id") REFERENCES "public"."marketplace_developers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_job_messages_job_created_idx" ON "economy_job_messages" USING btree ("job_id","created_at");