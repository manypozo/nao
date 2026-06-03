ALTER TABLE "context_recommendation" DROP CONSTRAINT "context_recommendation_run_id_context_recommendation_run_id_fk";
--> statement-breakpoint
ALTER TABLE "context_recommendation" ALTER COLUMN "run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "context_recommendation_run" ADD CONSTRAINT "context_recommendation_run_id_project_unique" UNIQUE("id","project_id");--> statement-breakpoint
ALTER TABLE "context_recommendation" ADD CONSTRAINT "context_recommendation_run_fk" FOREIGN KEY ("run_id","project_id") REFERENCES "public"."context_recommendation_run"("id","project_id") ON DELETE cascade ON UPDATE no action;