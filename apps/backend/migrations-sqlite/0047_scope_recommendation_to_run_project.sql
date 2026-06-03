PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_context_recommendation` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
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
	FOREIGN KEY (`status_changed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`run_id`,`project_id`) REFERENCES `context_recommendation_run`(`id`,`project_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_context_recommendation`("id", "project_id", "run_id", "fingerprint", "suggested_file", "subject_key", "status", "snoozed_until", "severity", "impact_score", "impact", "insights", "title", "summary", "suggested_action", "llm_provider", "llm_model_id", "first_seen_at", "last_seen_at", "occurrence_count", "status_changed_at", "status_changed_by", "created_at") SELECT "id", "project_id", "run_id", "fingerprint", "suggested_file", "subject_key", "status", "snoozed_until", "severity", "impact_score", "impact", "insights", "title", "summary", "suggested_action", "llm_provider", "llm_model_id", "first_seen_at", "last_seen_at", "occurrence_count", "status_changed_at", "status_changed_by", "created_at" FROM `context_recommendation`;--> statement-breakpoint
DROP TABLE `context_recommendation`;--> statement-breakpoint
ALTER TABLE `__new_context_recommendation` RENAME TO `context_recommendation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `context_recommendation_project_fingerprint_unique` ON `context_recommendation` (`project_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `context_recommendation_projectId_status_idx` ON `context_recommendation` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `context_recommendation_runId_idx` ON `context_recommendation` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `context_recommendation_run_id_project_unique` ON `context_recommendation_run` (`id`,`project_id`);