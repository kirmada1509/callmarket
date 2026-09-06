import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export type StoredLineage = {
  readonly parentRecordIds: readonly string[];
};

type StoredJson = Record<string, unknown>;

const lineageColumn = () =>
  text("lineage", { mode: "json" }).$type<StoredLineage>().notNull();

const provenanceColumns = () => ({
  scenarioId: text("scenario_id").notNull(),
  runId: text("run_id").notNull(),
  lineage: lineageColumn(),
});

export const scenarios = sqliteTable(
  "scenarios",
  {
    scenarioId: text("scenario_id").primaryKey(),
    domain: text("domain", { enum: ["dodo", "github"] }).notNull(),
    split: text("split", { enum: ["train", "holdout"] }).notNull(),
    generatorVersion: text("generator_version").notNull(),
    seed: integer("seed").notNull(),
    fixture: text("fixture", { mode: "json" }).$type<StoredJson>().notNull(),
    frozenAt: integer("frozen_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    check("scenarios_seed_nonnegative", sql`${table.seed} >= 0`),
    check(
      "holdout_scenarios_are_frozen",
      sql`${table.split} <> 'holdout' OR ${table.frozenAt} IS NOT NULL`,
    ),
    index("scenarios_domain_split_idx").on(table.domain, table.split),
  ],
);

export const runs = sqliteTable(
  "runs",
  {
    runId: text("run_id").primaryKey(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.scenarioId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    lineage: lineageColumn(),
    condition: text("condition", {
      enum: [
        "static_sprinter",
        "static_inspector",
        "majority_vote",
        "equal_ensemble",
        "callmarket",
      ],
    }).notNull(),
    seed: integer("seed").notNull(),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed"],
    }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    check("runs_seed_nonnegative", sql`${table.seed} >= 0`),
    uniqueIndex("runs_run_scenario_uidx").on(table.runId, table.scenarioId),
    index("runs_scenario_idx").on(table.scenarioId),
  ],
);

const runProvenanceForeignKey = <
  T extends {
    runId: AnySQLiteColumn;
    scenarioId: AnySQLiteColumn;
  },
>(table: T, name: string) =>
  foreignKey({
    name,
    columns: [table.runId, table.scenarioId],
    foreignColumns: [runs.runId, runs.scenarioId],
  })
    .onDelete("restrict")
    .onUpdate("restrict");

export const tasks = sqliteTable(
  "tasks",
  {
    taskId: text("task_id").primaryKey(),
    ...provenanceColumns(),
    request: text("request").notNull(),
    payload: text("payload", { mode: "json" }).$type<StoredJson>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    runProvenanceForeignKey(table, "tasks_run_provenance_fk"),
    uniqueIndex("tasks_run_uidx").on(table.runId),
  ],
);

export const contexts = sqliteTable(
  "contexts",
  {
    contextId: text("context_id").primaryKey(),
    ...provenanceColumns(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.taskId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    payload: text("payload", { mode: "json" }).$type<StoredJson>().notNull(),
    deterministicTags: text("deterministic_tags", { mode: "json" })
      .$type<readonly string[]>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    runProvenanceForeignKey(table, "contexts_run_provenance_fk"),
    uniqueIndex("contexts_run_uidx").on(table.runId),
    index("contexts_task_idx").on(table.taskId),
  ],
);

export const bids = sqliteTable(
  "bids",
  {
    bidId: text("bid_id").primaryKey(),
    ...provenanceColumns(),
    bidderId: text("bidder_id", {
      enum: ["sprinter", "inspector", "skeptic"],
    }).notNull(),
    rawOutput: text("raw_output", { mode: "json" }).$type<unknown>().notNull(),
    validatedPayload: text("validated_payload", { mode: "json" }).$type<
      StoredJson
    >(),
    valid: integer("valid", { mode: "boolean" }).notNull(),
    validationIssues: text("validation_issues", { mode: "json" })
      .$type<readonly string[]>()
      .notNull(),
    tokens: integer("tokens").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    runProvenanceForeignKey(table, "bids_run_provenance_fk"),
    check("bids_tokens_nonnegative", sql`${table.tokens} >= 0`),
    check("bids_latency_nonnegative", sql`${table.latencyMs} >= 0`),
    check(
      "valid_bids_have_payload",
      sql`(${table.valid} = 0) OR (${table.validatedPayload} IS NOT NULL)`,
    ),
    uniqueIndex("bids_run_bidder_uidx").on(table.runId, table.bidderId),
  ],
);

export const marketDecisions = sqliteTable(
  "market_decisions",
  {
    decisionId: text("decision_id").primaryKey(),
    ...provenanceColumns(),
    selectedBidId: text("selected_bid_id")
      .notNull()
      .references(() => bids.bidId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    riskPolicy: text("risk_policy", { mode: "json" })
      .$type<StoredJson>()
      .notNull(),
    scoreBreakdown: text("score_breakdown", { mode: "json" })
      .$type<StoredJson>()
      .notNull(),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    runProvenanceForeignKey(table, "market_decisions_run_provenance_fk"),
    uniqueIndex("market_decisions_run_uidx").on(table.runId),
    index("market_decisions_selected_bid_idx").on(table.selectedBidId),
  ],
);

export const toolExecutions = sqliteTable(
  "tool_executions",
  {
    executionId: text("execution_id").primaryKey(),
    ...provenanceColumns(),
    decisionId: text("decision_id")
      .notNull()
      .references(() => marketDecisions.decisionId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    adapterMode: text("adapter_mode", {
      enum: ["simulator", "live"],
    }).notNull(),
    domain: text("domain", { enum: ["dodo", "github"] }).notNull(),
    operation: text("operation").notNull(),
    request: text("request", { mode: "json" }).$type<StoredJson>().notNull(),
    rawEvidence: text("raw_evidence", { mode: "json" })
      .$type<unknown>()
      .notNull(),
    status: text("status", {
      enum: ["succeeded", "failed", "ambiguous"],
    }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    error: text("error"),
    executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    runProvenanceForeignKey(table, "tool_executions_run_provenance_fk"),
    check(
      "tool_executions_latency_nonnegative",
      sql`${table.latencyMs} >= 0`,
    ),
    uniqueIndex("tool_executions_decision_uidx").on(table.decisionId),
  ],
);

export const verifications = sqliteTable(
  "verifications",
  {
    verificationId: text("verification_id").primaryKey(),
    ...provenanceColumns(),
    executionId: text("execution_id")
      .notNull()
      .references(() => toolExecutions.executionId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    requiredPostconditions: text("required_postconditions", { mode: "json" })
      .$type<readonly StoredJson[]>()
      .notNull(),
    rawEvidence: text("raw_evidence", { mode: "json" })
      .$type<unknown>()
      .notNull(),
    policyViolations: text("policy_violations", { mode: "json" })
      .$type<readonly string[]>()
      .notNull(),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    runProvenanceForeignKey(table, "verifications_run_provenance_fk"),
    uniqueIndex("verifications_execution_uidx").on(table.executionId),
  ],
);

export const settlements = sqliteTable(
  "settlements",
  {
    settlementId: text("settlement_id").primaryKey(),
    ...provenanceColumns(),
    selectedBidId: text("selected_bid_id")
      .notNull()
      .references(() => bids.bidId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    verificationId: text("verification_id")
      .notNull()
      .references(() => verifications.verificationId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    predictedProbability: real("predicted_probability").notNull(),
    outcome: integer("outcome").notNull(),
    brierLoss: real("brier_loss").notNull(),
    brierScore: real("brier_score").notNull(),
    utility: real("utility").notNull(),
    settledAt: integer("settled_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    runProvenanceForeignKey(table, "settlements_run_provenance_fk"),
    check(
      "settlements_probability_range",
      sql`${table.predictedProbability} >= 0.01 AND ${table.predictedProbability} <= 0.99`,
    ),
    check("settlements_binary_outcome", sql`${table.outcome} IN (0, 1)`),
    check(
      "settlements_brier_loss_range",
      sql`${table.brierLoss} >= 0 AND ${table.brierLoss} <= 1`,
    ),
    check(
      "settlements_brier_score_range",
      sql`${table.brierScore} >= 0 AND ${table.brierScore} <= 1`,
    ),
    uniqueIndex("settlements_run_uidx").on(table.runId),
    uniqueIndex("settlements_verification_uidx").on(table.verificationId),
  ],
);

export const reputationBuckets = sqliteTable(
  "reputation_buckets",
  {
    reputationBucketId: text("reputation_bucket_id").primaryKey(),
    ...provenanceColumns(),
    settlementId: text("settlement_id")
      .notNull()
      .references(() => settlements.settlementId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    bidderId: text("bidder_id", {
      enum: ["sprinter", "inspector", "skeptic"],
    }).notNull(),
    level: text("level", {
      enum: ["global", "capability", "context"],
    }).notNull(),
    bucketKey: text("bucket_key").notNull(),
    score: real("score").notNull(),
    sampleCount: integer("sample_count").notNull(),
    previousBucketId: text("previous_bucket_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    runProvenanceForeignKey(table, "reputation_buckets_run_provenance_fk"),
    check(
      "reputation_buckets_score_range",
      sql`${table.score} >= 0 AND ${table.score} <= 1`,
    ),
    check(
      "reputation_buckets_samples_positive",
      sql`${table.sampleCount} > 0`,
    ),
    index("reputation_buckets_lookup_idx").on(
      table.bidderId,
      table.level,
      table.bucketKey,
      table.createdAt,
    ),
    index("reputation_buckets_settlement_idx").on(table.settlementId),
  ],
);

export const bankrollEvents = sqliteTable(
  "bankroll_events",
  {
    bankrollEventId: text("bankroll_event_id").primaryKey(),
    ...provenanceColumns(),
    settlementId: text("settlement_id")
      .notNull()
      .references(() => settlements.settlementId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    bidderId: text("bidder_id", {
      enum: ["sprinter", "inspector", "skeptic"],
    }).notNull(),
    stake: real("stake").notNull(),
    brierScore: real("brier_score").notNull(),
    delta: real("delta").notNull(),
    balanceAfter: real("balance_after").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    runProvenanceForeignKey(table, "bankroll_events_run_provenance_fk"),
    check("bankroll_events_stake_nonnegative", sql`${table.stake} >= 0`),
    check(
      "bankroll_events_brier_score_range",
      sql`${table.brierScore} >= 0 AND ${table.brierScore} <= 1`,
    ),
    index("bankroll_events_bidder_time_idx").on(
      table.bidderId,
      table.createdAt,
    ),
    index("bankroll_events_settlement_idx").on(table.settlementId),
  ],
);

export const benchmarkRuns = sqliteTable(
  "benchmark_runs",
  {
    benchmarkRunId: text("benchmark_run_id").primaryKey(),
    ...provenanceColumns(),
    manifestDigest: text("manifest_digest").notNull(),
    condition: text("condition", {
      enum: [
        "static_sprinter",
        "static_inspector",
        "majority_vote",
        "equal_ensemble",
        "callmarket",
      ],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed"],
    }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    runProvenanceForeignKey(table, "benchmark_runs_run_provenance_fk"),
    index("benchmark_runs_manifest_condition_idx").on(
      table.manifestDigest,
      table.condition,
    ),
  ],
);

export const benchmarkMetrics = sqliteTable(
  "benchmark_metrics",
  {
    benchmarkMetricId: text("benchmark_metric_id").primaryKey(),
    ...provenanceColumns(),
    benchmarkRunId: text("benchmark_run_id")
      .notNull()
      .references(() => benchmarkRuns.benchmarkRunId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    metric: text("metric", {
      enum: [
        "completion_rate",
        "unsafe_action_rate",
        "correct_escalation_rate",
        "brier_loss",
        "expected_calibration_error",
        "tokens_per_success",
        "tool_calls_per_success",
        "latency_p50_ms",
        "latency_p95_ms",
        "expected_utility",
        "capability_transfer_lift",
      ],
    }).notNull(),
    value: real("value").notNull(),
    sampleSize: integer("sample_size").notNull(),
    confidenceLow: real("confidence_low"),
    confidenceHigh: real("confidence_high"),
    calculatedAt: integer("calculated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    runProvenanceForeignKey(table, "benchmark_metrics_run_provenance_fk"),
    check(
      "benchmark_metrics_sample_size_positive",
      sql`${table.sampleSize} > 0`,
    ),
    check(
      "benchmark_metrics_confidence_order",
      sql`${table.confidenceLow} IS NULL OR ${table.confidenceHigh} IS NULL OR ${table.confidenceLow} <= ${table.confidenceHigh}`,
    ),
    uniqueIndex("benchmark_metrics_run_metric_uidx").on(
      table.benchmarkRunId,
      table.metric,
    ),
  ],
);
