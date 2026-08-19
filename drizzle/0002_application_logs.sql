CREATE TYPE "public"."log_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TABLE "application_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"request_id" text,
	"transaction_id" uuid,
	"level" "log_level" NOT NULL,
	"event" text NOT NULL,
	"message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_log" ADD CONSTRAINT "application_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_log_user_created_idx" ON "application_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "application_log_request_idx" ON "application_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "application_log_transaction_idx" ON "application_log" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "application_log_event_idx" ON "application_log" USING btree ("user_id","event");
