CREATE TABLE `context_recommendation` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text,
	`fingerprint` text NOT NULL,
	`suggested_file` text NOT NULL,
	`subject_key` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`snoozed_until` integer,
	`severity` text DEFAULT 'medium' NOT NULL,
	`impact_score` integer DEFAULT 0 NOT NULL,
	`impact` text,
	`insights` text DEFAULT '[]' NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`suggested_action` text NOT NULL,
	`llm_provider` text,
	`llm_model_id` text,
	`first_seen_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_seen_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`occurrence_count` integer DEFAULT 1 NOT NULL,
	`status_changed_at` integer,
	`status_changed_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `context_recommendation_run`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`status_changed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `context_recommendation_project_fingerprint_unique` ON `context_recommendation` (`project_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `context_recommendation_projectId_status_idx` ON `context_recommendation` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `context_recommendation_runId_idx` ON `context_recommendation` (`run_id`);--> statement-breakpoint
CREATE TABLE `context_recommendation_run` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`trigger` text DEFAULT 'schedule' NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`window_start` integer,
	`window_end` integer,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	`error_message` text,
	`llm_provider` text,
	`llm_model_id` text,
	`input_total_tokens` integer,
	`output_total_tokens` integer,
	`total_tokens` integer,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `context_recommendation_run_projectId_idx` ON `context_recommendation_run` (`project_id`);--> statement-breakpoint
CREATE INDEX `context_recommendation_run_status_idx` ON `context_recommendation_run` (`status`);