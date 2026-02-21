CREATE TABLE "ans_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_subscription_id" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ans_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "ans_domains" ADD COLUMN "agent_card_version" varchar(16) DEFAULT '1.0';--> statement-breakpoint
ALTER TABLE "ans_domains" ADD COLUMN "private_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "ans_domains" ADD COLUMN "verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ans_domains" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "ans_subscriptions" ADD CONSTRAINT "ans_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ans_subscriptions" ADD CONSTRAINT "ans_subscriptions_domain_id_ans_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."ans_domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ans_subscriptions_stripe_id_idx" ON "ans_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "ans_subscriptions_user_id_idx" ON "ans_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ans_subscriptions_domain_id_idx" ON "ans_subscriptions" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "ans_subscriptions_status_idx" ON "ans_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ans_domains_status_idx" ON "ans_domains" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ans_domains_expires_at_idx" ON "ans_domains" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_stripe_customer_id_idx" ON "users" USING btree ("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id");