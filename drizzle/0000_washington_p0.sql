CREATE TABLE `workspaces` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `external_user_id` text NOT NULL,
  `email` text NOT NULL,
  `display_name` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_external_user_id` ON `users` (`external_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_users_workspace_id` ON `users` (`workspace_id`);
--> statement-breakpoint
CREATE TABLE `clients` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `name` text NOT NULL,
  `objective` text NOT NULL,
  `settings_json` text DEFAULT '{}' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_clients_workspace_id` ON `clients` (`workspace_id`);
--> statement-breakpoint
CREATE TABLE `meta_connections` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `provider` text NOT NULL,
  `status` text NOT NULL,
  `credential_ref` text,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `last_checked_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_meta_connections_workspace_id` ON `meta_connections` (`workspace_id`);
--> statement-breakpoint
CREATE TABLE `ad_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `client_id` text NOT NULL,
  `connection_id` text,
  `meta_account_id` text NOT NULL,
  `name` text NOT NULL,
  `currency` text NOT NULL,
  `timezone` text NOT NULL,
  `attribution_json` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ad_accounts_workspace_meta` ON `ad_accounts` (`workspace_id`,`meta_account_id`);
--> statement-breakpoint
CREATE INDEX `idx_ad_accounts_client_id` ON `ad_accounts` (`client_id`);
--> statement-breakpoint
CREATE TABLE `report_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `client_id` text NOT NULL,
  `ad_account_id` text NOT NULL,
  `requested_by` text NOT NULL,
  `status` text NOT NULL,
  `config_json` text NOT NULL,
  `error_code` text,
  `error_message` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_report_runs_workspace_created` ON `report_runs` (`workspace_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_report_runs_status` ON `report_runs` (`status`);
--> statement-breakpoint
CREATE TABLE `raw_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `report_run_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `source` text NOT NULL,
  `source_hash` text NOT NULL,
  `raw_reference` text,
  `payload_json` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_raw_snapshots_report_run` ON `raw_snapshots` (`report_run_id`);
--> statement-breakpoint
CREATE INDEX `idx_raw_snapshots_workspace_created` ON `raw_snapshots` (`workspace_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `normalized_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `report_run_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `source` text NOT NULL,
  `source_hash` text NOT NULL,
  `period_start` text NOT NULL,
  `period_end` text NOT NULL,
  `currency` text NOT NULL,
  `timezone` text NOT NULL,
  `attribution_json` text NOT NULL,
  `snapshot_json` text NOT NULL,
  `quality_score` integer NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_snapshots_report_run` ON `normalized_snapshots` (`report_run_id`);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_workspace_created` ON `normalized_snapshots` (`workspace_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `report_analyses` (
  `id` text PRIMARY KEY NOT NULL,
  `report_run_id` text NOT NULL,
  `snapshot_id` text NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `prompt_version` text NOT NULL,
  `output_json` text NOT NULL,
  `validation_json` text NOT NULL,
  `duration_ms` integer NOT NULL,
  `input_tokens` integer,
  `output_tokens` integer,
  `estimated_cost_micros` integer,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_report_analyses_report_run` ON `report_analyses` (`report_run_id`);
--> statement-breakpoint
CREATE TABLE `report_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `report_run_id` text NOT NULL,
  `version_number` integer NOT NULL,
  `content_json` text NOT NULL,
  `status` text NOT NULL,
  `created_by` text NOT NULL,
  `approved_by` text,
  `approved_at` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_report_versions_run_number` ON `report_versions` (`report_run_id`,`version_number`);
--> statement-breakpoint
CREATE TABLE `report_artifacts` (
  `id` text PRIMARY KEY NOT NULL,
  `report_run_id` text NOT NULL,
  `report_version_id` text NOT NULL,
  `object_key` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `checksum` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_report_artifacts_version` ON `report_artifacts` (`report_version_id`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `actor_id` text NOT NULL,
  `action` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_workspace_created` ON `audit_logs` (`workspace_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
