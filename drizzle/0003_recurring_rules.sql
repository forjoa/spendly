CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "recurring_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"category" text,
	"frequency" "recurring_frequency" NOT NULL,
	"day_of_month" integer,
	"month_of_year" integer,
	"start_date" timestamp NOT NULL,
	"next_run_date" timestamp NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_rule" ADD CONSTRAINT "recurring_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "recurring_rule_id" uuid;--> statement-breakpoint
CREATE INDEX "recurring_rule_user_idx" ON "recurring_rule" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_rule_due_idx" ON "recurring_rule" USING btree ("active","next_run_date");
