CREATE TABLE "marketplace_developers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_account_id" varchar(255),
	"stripe_onboarding_complete" boolean DEFAULT false,
	"subscriber_count" integer DEFAULT 0 NOT NULL,
	"rating" double precision,
	"fee_tier" varchar(20) DEFAULT 'newcomer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "marketplace_developers_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"strategy_snapshot" jsonb NOT NULL,
	"price_monthly_cents" integer NOT NULL,
	"price_yearly_cents" integer,
	"platform_fee_percent" integer DEFAULT 20 NOT NULL,
	"is_active" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketplace_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"stripe_subscription_id" varchar(255),
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "marketplace_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "api_key_viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_developers" ADD CONSTRAINT "marketplace_developers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_strategies" ADD CONSTRAINT "marketplace_strategies_developer_id_marketplace_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."marketplace_developers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_subscriptions" ADD CONSTRAINT "marketplace_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_subscriptions" ADD CONSTRAINT "marketplace_subscriptions_strategy_id_marketplace_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."marketplace_strategies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_developers_user_id_idx" ON "marketplace_developers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketplace_strategies_developer_id_idx" ON "marketplace_strategies" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "marketplace_strategies_is_active_idx" ON "marketplace_strategies" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "marketplace_subscriptions_user_id_idx" ON "marketplace_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketplace_subscriptions_strategy_id_idx" ON "marketplace_subscriptions" USING btree ("strategy_id");