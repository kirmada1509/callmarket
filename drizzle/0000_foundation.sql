CREATE TABLE `bankroll_events` (
	`bankroll_event_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`settlement_id` text NOT NULL,
	`bidder_id` text NOT NULL,
	`stake` real NOT NULL,
	`brier_score` real NOT NULL,
	`delta` real NOT NULL,
	`balance_after` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`settlement_id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict,
	CONSTRAINT "bankroll_events_stake_nonnegative" CHECK("bankroll_events"."stake" >= 0),
	CONSTRAINT "bankroll_events_brier_score_range" CHECK("bankroll_events"."brier_score" >= 0 AND "bankroll_events"."brier_score" <= 1)
);
--> statement-breakpoint
CREATE INDEX `bankroll_events_bidder_time_idx` ON `bankroll_events` (`bidder_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bankroll_events_settlement_idx` ON `bankroll_events` (`settlement_id`);--> statement-breakpoint
CREATE TABLE `benchmark_metrics` (
	`benchmark_metric_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`benchmark_run_id` text NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`sample_size` integer NOT NULL,
	`confidence_low` real,
	`confidence_high` real,
	`calculated_at` integer NOT NULL,
	FOREIGN KEY (`benchmark_run_id`) REFERENCES `benchmark_runs`(`benchmark_run_id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict,
	CONSTRAINT "benchmark_metrics_sample_size_positive" CHECK("benchmark_metrics"."sample_size" > 0),
	CONSTRAINT "benchmark_metrics_confidence_order" CHECK("benchmark_metrics"."confidence_low" IS NULL OR "benchmark_metrics"."confidence_high" IS NULL OR "benchmark_metrics"."confidence_low" <= "benchmark_metrics"."confidence_high")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `benchmark_metrics_run_metric_uidx` ON `benchmark_metrics` (`benchmark_run_id`,`metric`);--> statement-breakpoint
CREATE TABLE `benchmark_runs` (
	`benchmark_run_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`manifest_digest` text NOT NULL,
	`condition` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `benchmark_runs_manifest_condition_idx` ON `benchmark_runs` (`manifest_digest`,`condition`);--> statement-breakpoint
CREATE TABLE `bids` (
	`bid_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`bidder_id` text NOT NULL,
	`raw_output` text NOT NULL,
	`validated_payload` text,
	`valid` integer NOT NULL,
	`validation_issues` text NOT NULL,
	`tokens` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict,
	CONSTRAINT "bids_tokens_nonnegative" CHECK("bids"."tokens" >= 0),
	CONSTRAINT "bids_latency_nonnegative" CHECK("bids"."latency_ms" >= 0),
	CONSTRAINT "valid_bids_have_payload" CHECK(("bids"."valid" = 0) OR ("bids"."validated_payload" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bids_run_bidder_uidx` ON `bids` (`run_id`,`bidder_id`);--> statement-breakpoint
CREATE TABLE `contexts` (
	`context_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`task_id` text NOT NULL,
	`payload` text NOT NULL,
	`deterministic_tags` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`task_id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contexts_run_uidx` ON `contexts` (`run_id`);--> statement-breakpoint
CREATE INDEX `contexts_task_idx` ON `contexts` (`task_id`);--> statement-breakpoint
CREATE TABLE `market_decisions` (
	`decision_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`selected_bid_id` text NOT NULL,
	`risk_policy` text NOT NULL,
	`score_breakdown` text NOT NULL,
	`decided_at` integer NOT NULL,
	FOREIGN KEY (`selected_bid_id`) REFERENCES `bids`(`bid_id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_decisions_run_uidx` ON `market_decisions` (`run_id`);--> statement-breakpoint
CREATE INDEX `market_decisions_selected_bid_idx` ON `market_decisions` (`selected_bid_id`);--> statement-breakpoint
CREATE TABLE `reputation_buckets` (
	`reputation_bucket_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`settlement_id` text NOT NULL,
	`bidder_id` text NOT NULL,
	`level` text NOT NULL,
	`bucket_key` text NOT NULL,
	`score` real NOT NULL,
	`sample_count` integer NOT NULL,
	`previous_bucket_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`settlement_id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict,
	CONSTRAINT "reputation_buckets_score_range" CHECK("reputation_buckets"."score" >= 0 AND "reputation_buckets"."score" <= 1),
	CONSTRAINT "reputation_buckets_samples_positive" CHECK("reputation_buckets"."sample_count" > 0)
);
--> statement-breakpoint
CREATE INDEX `reputation_buckets_lookup_idx` ON `reputation_buckets` (`bidder_id`,`level`,`bucket_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `reputation_buckets_settlement_idx` ON `reputation_buckets` (`settlement_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`lineage` text NOT NULL,
	`condition` text NOT NULL,
	`seed` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`scenario_id`) ON UPDATE restrict ON DELETE restrict,
	CONSTRAINT "runs_seed_nonnegative" CHECK("runs"."seed" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_run_scenario_uidx` ON `runs` (`run_id`,`scenario_id`);--> statement-breakpoint
CREATE INDEX `runs_scenario_idx` ON `runs` (`scenario_id`);--> statement-breakpoint
CREATE TABLE `scenarios` (
	`scenario_id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`split` text NOT NULL,
	`generator_version` text NOT NULL,
	`seed` integer NOT NULL,
	`fixture` text NOT NULL,
	`frozen_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "scenarios_seed_nonnegative" CHECK("scenarios"."seed" >= 0),
	CONSTRAINT "holdout_scenarios_are_frozen" CHECK("scenarios"."split" <> 'holdout' OR "scenarios"."frozen_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `scenarios_domain_split_idx` ON `scenarios` (`domain`,`split`);--> statement-breakpoint
CREATE TABLE `settlements` (
	`settlement_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`selected_bid_id` text NOT NULL,
	`verification_id` text NOT NULL,
	`predicted_probability` real NOT NULL,
	`outcome` integer NOT NULL,
	`brier_loss` real NOT NULL,
	`brier_score` real NOT NULL,
	`utility` real NOT NULL,
	`settled_at` integer NOT NULL,
	FOREIGN KEY (`selected_bid_id`) REFERENCES `bids`(`bid_id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`verification_id`) REFERENCES `verifications`(`verification_id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict,
	CONSTRAINT "settlements_probability_range" CHECK("settlements"."predicted_probability" >= 0.01 AND "settlements"."predicted_probability" <= 0.99),
	CONSTRAINT "settlements_binary_outcome" CHECK("settlements"."outcome" IN (0, 1)),
	CONSTRAINT "settlements_brier_loss_range" CHECK("settlements"."brier_loss" >= 0 AND "settlements"."brier_loss" <= 1),
	CONSTRAINT "settlements_brier_score_range" CHECK("settlements"."brier_score" >= 0 AND "settlements"."brier_score" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settlements_run_uidx` ON `settlements` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `settlements_verification_uidx` ON `settlements` (`verification_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`task_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`request` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_run_uidx` ON `tasks` (`run_id`);--> statement-breakpoint
CREATE TABLE `tool_executions` (
	`execution_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`decision_id` text NOT NULL,
	`adapter_mode` text NOT NULL,
	`domain` text NOT NULL,
	`operation` text NOT NULL,
	`request` text NOT NULL,
	`raw_evidence` text NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`error` text,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`decision_id`) REFERENCES `market_decisions`(`decision_id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict,
	CONSTRAINT "tool_executions_latency_nonnegative" CHECK("tool_executions"."latency_ms" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tool_executions_decision_uidx` ON `tool_executions` (`decision_id`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`verification_id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`run_id` text NOT NULL,
	`lineage` text NOT NULL,
	`execution_id` text NOT NULL,
	`passed` integer NOT NULL,
	`required_postconditions` text NOT NULL,
	`raw_evidence` text NOT NULL,
	`policy_violations` text NOT NULL,
	`verified_at` integer NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `tool_executions`(`execution_id`) ON UPDATE restrict ON DELETE restrict,
	FOREIGN KEY (`run_id`,`scenario_id`) REFERENCES `runs`(`run_id`,`scenario_id`) ON UPDATE restrict ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verifications_execution_uidx` ON `verifications` (`execution_id`);--> statement-breakpoint
CREATE TRIGGER `scenarios_identity_immutable`
BEFORE UPDATE OF `scenario_id` ON `scenarios`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
BEGIN
  SELECT RAISE(ABORT, 'scenario_id is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `holdout_scenarios_immutable`
BEFORE UPDATE ON `scenarios`
WHEN OLD.`split` = 'holdout'
BEGIN
  SELECT RAISE(ABORT, 'frozen holdout scenarios are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `runs_provenance_immutable`
BEFORE UPDATE OF `run_id`, `scenario_id`, `lineage` ON `runs`
WHEN NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'run provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `tasks`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `contexts_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `contexts`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `bids_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `bids`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `market_decisions_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `market_decisions`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `tool_executions_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `tool_executions`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `verifications_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `verifications`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `settlements_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `settlements`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `reputation_buckets_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `reputation_buckets`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `bankroll_events_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `bankroll_events`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `benchmark_runs_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `benchmark_runs`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `benchmark_metrics_provenance_immutable`
BEFORE UPDATE OF `scenario_id`, `run_id`, `lineage` ON `benchmark_metrics`
WHEN NEW.`scenario_id` IS NOT OLD.`scenario_id`
  OR NEW.`run_id` IS NOT OLD.`run_id`
  OR NEW.`lineage` IS NOT OLD.`lineage`
BEGIN
  SELECT RAISE(ABORT, 'record provenance is immutable');
END;
