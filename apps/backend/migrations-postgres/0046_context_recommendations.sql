CREATE TABLE "context_recommendation" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"run_id" text,
	"fingerprint" text NOT NULL,
	"suggested_file" text NOT NULL,
	"subject_key" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"snoozed_until" timestamp,
	"severity" text DEFAULT 'medium' NOT NULL,
	"impact_score" integer DEFAULT 0 NOT NULL,
	"impact" jsonb,
	"insights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"suggested_action" text NOT NULL,
	"llm_provider" text,
	"llm_model_id" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"status_changed_at" timestamp,
	"status_changed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_recommendation_run" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"window_start" timestamp,
	"window_end" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"error_message" text,
	"llm_provider" text,
	"llm_model_id" text,
	"input_total_tokens" integer,
	"output_total_tokens" integer,
	"total_tokens" integer
);
--> statement-breakpoint
ALTER TABLE "context_recommendation" ADD CONSTRAINT "context_recommendation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_recommendation" ADD CONSTRAINT "context_recommendation_run_id_context_recommendation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."context_recommendation_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_recommendation" ADD CONSTRAINT "context_recommendation_status_changed_by_user_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_recommendation_run" ADD CONSTRAINT "context_recommendation_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "context_recommendation_project_fingerprint_unique" ON "context_recommendation" USING btree ("project_id","fingerprint");--> statement-breakpoint
CREATE INDEX "context_recommendation_projectId_status_idx" ON "context_recommendation" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "context_recommendation_runId_idx" ON "context_recommendation" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "context_recommendation_run_projectId_idx" ON "context_recommendation_run" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "context_recommendation_run_status_idx" ON "context_recommendation_run" USING btree ("status");