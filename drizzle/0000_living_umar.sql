CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" varchar(255),
	"id_token" text,
	"session_state" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "advanced_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"base_config" jsonb NOT NULL,
	"rules" jsonb NOT NULL,
	"global_limits" jsonb,
	"execution_mode" varchar(20) DEFAULT 'sequential' NOT NULL,
	"is_public" boolean DEFAULT false,
	"tags" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(100) NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"permissions" jsonb DEFAULT '["bet","read"]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "blackjack_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bet_amount" integer NOT NULL,
	"player_hands" jsonb NOT NULL,
	"dealer_hand" jsonb NOT NULL,
	"deck" jsonb NOT NULL,
	"status" varchar(20) NOT NULL,
	"server_seed_id" uuid,
	"client_seed" text,
	"nonce" bigint,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crash_bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crash_round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"cashed_out_at" double precision,
	"payout" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crash_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crash_point" double precision NOT NULL,
	"server_seed_id" uuid,
	"client_seed" text,
	"nonce" bigint,
	"status" varchar(20) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_price_id" varchar(255) NOT NULL,
	"name" varchar(100),
	"credits" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	CONSTRAINT "credit_packages_stripe_price_id_unique" UNIQUE("stripe_price_id")
);
--> statement-breakpoint
CREATE TABLE "faucet_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "game_bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_type" varchar(20) NOT NULL,
	"amount" integer NOT NULL,
	"outcome" varchar(10) NOT NULL,
	"payout" integer NOT NULL,
	"result_payload" jsonb,
	"server_seed_id" uuid,
	"client_seed" text,
	"nonce" bigint,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "server_seeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seed_hash" varchar(64) NOT NULL,
	"seed" varchar(64),
	"used" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_type" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategy_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"python_code" text,
	"description" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"is_public" boolean DEFAULT false,
	"version" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"type" varchar(100),
	"payload" jsonb,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"image" text,
	"email_verified" timestamp with time zone,
	"google_id" varchar(255),
	"credits" integer DEFAULT 0 NOT NULL,
	"faucet_credits" integer DEFAULT 0 NOT NULL,
	"api_key_hash" varchar(64),
	"api_key_prefix" varchar(12),
	"api_key_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"last_faucet_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advanced_strategies" ADD CONSTRAINT "advanced_strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_rounds" ADD CONSTRAINT "blackjack_rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_rounds" ADD CONSTRAINT "blackjack_rounds_server_seed_id_server_seeds_id_fk" FOREIGN KEY ("server_seed_id") REFERENCES "public"."server_seeds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crash_bets" ADD CONSTRAINT "crash_bets_crash_round_id_crash_rounds_id_fk" FOREIGN KEY ("crash_round_id") REFERENCES "public"."crash_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crash_bets" ADD CONSTRAINT "crash_bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crash_rounds" ADD CONSTRAINT "crash_rounds_server_seed_id_server_seeds_id_fk" FOREIGN KEY ("server_seed_id") REFERENCES "public"."server_seeds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faucet_grants" ADD CONSTRAINT "faucet_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_bets" ADD CONSTRAINT "game_bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_bets" ADD CONSTRAINT "game_bets_server_seed_id_server_seeds_id_fk" FOREIGN KEY ("server_seed_id") REFERENCES "public"."server_seeds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_code" ADD CONSTRAINT "strategy_code_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advanced_strategies_user_name_idx" ON "advanced_strategies" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "crash_bets_round_user_idx" ON "crash_bets" USING btree ("crash_round_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crash_bets_round_idx" ON "crash_bets" USING btree ("crash_round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crash_rounds_status_started_idx" ON "crash_rounds" USING btree ("status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "faucet_grants_user_created_idx" ON "faucet_grants" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "game_bets_user_created_idx" ON "game_bets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "game_bets_game_created_idx" ON "game_bets" USING btree ("game_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "strategies_user_game_name_idx" ON "strategies" USING btree ("user_id","game_type","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_id_idx" ON "users" USING btree ("google_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_api_key_hash_idx" ON "users" USING btree ("api_key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");