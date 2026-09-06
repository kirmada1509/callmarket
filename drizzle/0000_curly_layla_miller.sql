CREATE TABLE `bids` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`bidder_id` text NOT NULL,
	`payload` text NOT NULL,
	`valid` integer NOT NULL,
	`tokens` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reputation_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`bidder_id` text NOT NULL,
	`level` text NOT NULL,
	`bucket_key` text NOT NULL,
	`score` real NOT NULL,
	`sample_count` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`condition` text NOT NULL,
	`seed` integer NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`split` text NOT NULL,
	`fixture` text NOT NULL,
	`frozen_at` integer
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`selected_bid_id` text,
	`verified` integer NOT NULL,
	`brier_score` real NOT NULL,
	`utility` real NOT NULL,
	`evidence` text NOT NULL,
	`settled_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_bid_id`) REFERENCES `bids`(`id`) ON UPDATE no action ON DELETE no action
);
