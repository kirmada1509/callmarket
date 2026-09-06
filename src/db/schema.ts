import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const scenarios = sqliteTable("scenarios", {
  id: text("id").primaryKey(),
  domain: text("domain", { enum: ["dodo", "github"] }).notNull(),
  split: text("split", { enum: ["train", "holdout"] }).notNull(),
  fixture: text("fixture", { mode: "json" }).notNull(),
  frozenAt: integer("frozen_at", { mode: "timestamp_ms" }),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id")
    .notNull()
    .references(() => scenarios.id),
  condition: text("condition", {
    enum: ["single_agent", "no_memory_market", "callmarket"],
  }).notNull(),
  seed: integer("seed").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const bids = sqliteTable("bids", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  bidderId: text("bidder_id", {
    enum: ["sprinter", "inspector", "skeptic"],
  }).notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  valid: integer("valid", { mode: "boolean" }).notNull(),
  tokens: integer("tokens").notNull(),
  latencyMs: integer("latency_ms").notNull(),
});

export const settlements = sqliteTable("settlements", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  selectedBidId: text("selected_bid_id").references(() => bids.id),
  verified: integer("verified", { mode: "boolean" }).notNull(),
  brierScore: real("brier_score").notNull(),
  utility: real("utility").notNull(),
  evidence: text("evidence", { mode: "json" }).notNull(),
  settledAt: integer("settled_at", { mode: "timestamp_ms" }).notNull(),
});

export const reputationBuckets = sqliteTable("reputation_buckets", {
  id: text("id").primaryKey(),
  bidderId: text("bidder_id").notNull(),
  level: text("level", { enum: ["global", "capability", "context"] }).notNull(),
  bucketKey: text("bucket_key").notNull(),
  score: real("score").notNull(),
  sampleCount: integer("sample_count").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
