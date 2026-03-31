CREATE TABLE IF NOT EXISTS "playground_provider_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" varchar(40) NOT NULL,
  "alias" varchar(120) NOT NULL,
  "display_name" varchar(160),
  "auth_mode" varchar(24) NOT NULL,
  "secret_encrypted" text NOT NULL,
  "base_url" varchar(512),
  "default_model" varchar(160),
  "status" varchar(24) DEFAULT 'active' NOT NULL,
  "last_validated_at" timestamp with time zone,
  "last_validation_error" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "playground_provider_connections" ADD CONSTRAINT "playground_provider_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "playground_provider_connections_user_provider_idx" ON "playground_provider_connections" USING btree ("user_id","provider");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "playground_provider_connections_user_alias_idx" ON "playground_provider_connections" USING btree ("user_id","alias");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playground_provider_connections_user_idx" ON "playground_provider_connections" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playground_provider_connections_status_idx" ON "playground_provider_connections" USING btree ("status");
