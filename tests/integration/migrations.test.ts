import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const clients: Client[] = [];
const now = 1_788_696_000_000;

const lineage = (parentRecordId: string) =>
  JSON.stringify({ parentRecordIds: [parentRecordId] });

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function migratedClient() {
  const directory = await mkdtemp(resolve(tmpdir(), "callmarket-migration-"));
  temporaryDirectories.push(directory);
  const client = createClient({ url: `file:${resolve(directory, "clean.db")}` });
  clients.push(client);

  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(drizzle(client), { migrationsFolder: resolve("drizzle") });
  return client;
}

async function insertScenario(
  client: Client,
  scenarioId: string,
  domain: "dodo" | "github" = "dodo",
) {
  await client.execute({
    sql: "INSERT INTO scenarios (scenario_id, domain, split, generator_version, seed, fixture, frozen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [scenarioId, domain, "train", "1.0.0", 1, "{}", null, now],
  });
}

async function insertRun(client: Client, runId: string, scenarioId: string) {
  await client.execute({
    sql: "INSERT INTO runs (run_id, scenario_id, lineage, condition, seed, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [
      runId,
      scenarioId,
      lineage(scenarioId),
      "callmarket",
      1,
      "running",
      now,
    ],
  });
}

async function seedThroughDecision(
  client: Client,
  prefix: string,
  scenarioId: string,
) {
  const runId = `${prefix}-run`;
  const bidId = `${prefix}-bid`;
  const decisionId = `${prefix}-decision`;

  await insertRun(client, runId, scenarioId);
  await client.execute({
    sql: "INSERT INTO bids (bid_id, scenario_id, run_id, lineage, bidder_id, raw_output, validated_payload, valid, validation_issues, tokens, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      bidId,
      scenarioId,
      runId,
      lineage(runId),
      "inspector",
      "{}",
      "{}",
      1,
      "[]",
      10,
      5,
      now,
    ],
  });
  await client.execute({
    sql: "INSERT INTO market_decisions (decision_id, scenario_id, run_id, lineage, selected_bid_id, risk_policy, score_breakdown, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      decisionId,
      scenarioId,
      runId,
      lineage(bidId),
      bidId,
      "{}",
      "{}",
      now,
    ],
  });

  return { runId, bidId, decisionId };
}

async function seedThroughExecution(
  client: Client,
  prefix: string,
  scenarioId: string,
) {
  const decision = await seedThroughDecision(client, prefix, scenarioId);
  const executionId = `${prefix}-execution`;

  await client.execute({
    sql: "INSERT INTO tool_executions (execution_id, scenario_id, run_id, lineage, decision_id, adapter_mode, domain, operation, request, raw_evidence, status, latency_ms, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      executionId,
      scenarioId,
      decision.runId,
      lineage(decision.decisionId),
      decision.decisionId,
      "simulator",
      "dodo",
      "fetch_current_state",
      "{}",
      "{}",
      "succeeded",
      5,
      now,
    ],
  });

  return { ...decision, executionId };
}

async function seedThroughVerification(
  client: Client,
  prefix: string,
  scenarioId: string,
) {
  const execution = await seedThroughExecution(client, prefix, scenarioId);
  const verificationId = `${prefix}-verification`;

  await client.execute({
    sql: "INSERT INTO verifications (verification_id, scenario_id, run_id, lineage, execution_id, passed, required_postconditions, raw_evidence, policy_violations, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      verificationId,
      scenarioId,
      execution.runId,
      lineage(execution.executionId),
      execution.executionId,
      1,
      "[]",
      "{}",
      "[]",
      now,
    ],
  });

  return { ...execution, verificationId };
}

async function seedFullGraph(
  client: Client,
  prefix: string,
  scenarioId: string,
) {
  const taskId = `${prefix}-task`;
  const settlementId = `${prefix}-settlement`;
  const benchmarkRunId = `${prefix}-benchmark`;
  const chain = await seedThroughVerification(client, prefix, scenarioId);

  await client.execute({
    sql: "INSERT INTO tasks (task_id, scenario_id, run_id, lineage, request, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [
      taskId,
      scenarioId,
      chain.runId,
      lineage(chain.runId),
      "Inspect the current state",
      "{}",
      now,
    ],
  });
  await client.execute({
    sql: "INSERT INTO settlements (settlement_id, scenario_id, run_id, lineage, selected_bid_id, verification_id, predicted_probability, outcome, brier_loss, brier_score, utility, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      settlementId,
      scenarioId,
      chain.runId,
      lineage(chain.verificationId),
      chain.bidId,
      chain.verificationId,
      0.8,
      1,
      0.04,
      0.96,
      10,
      now,
    ],
  });
  await client.execute({
    sql: "INSERT INTO benchmark_runs (benchmark_run_id, scenario_id, run_id, lineage, manifest_digest, condition, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      benchmarkRunId,
      scenarioId,
      chain.runId,
      lineage(chain.runId),
      `sha256:${"a".repeat(64)}`,
      "callmarket",
      "running",
      now,
    ],
  });

  return { ...chain, taskId, settlementId, benchmarkRunId };
}

describe("foundation migration", () => {
  it("creates every auditable evidence and calculated-record table cleanly", async () => {
    const client = await migratedClient();
    const derivedTables = [
      "bankroll_events",
      "benchmark_metrics",
      "benchmark_runs",
      "bids",
      "contexts",
      "market_decisions",
      "reputation_buckets",
      "runs",
      "settlements",
      "tasks",
      "tool_executions",
      "verifications",
    ];
    const rows = await client.execute(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' ORDER BY name",
    );

    expect(rows.rows.map((row) => row.name)).toEqual([
      "bankroll_events",
      "benchmark_metrics",
      "benchmark_runs",
      "bids",
      "contexts",
      "market_decisions",
      "reputation_buckets",
      "runs",
      "scenarios",
      "settlements",
      "tasks",
      "tool_executions",
      "verifications",
    ]);

    for (const table of derivedTables) {
      const columns = await client.execute(`PRAGMA table_info(${table})`);
      const columnNames = columns.rows.map((column) => column.name);
      expect(columnNames, table).toEqual(
        expect.arrayContaining(["scenario_id", "run_id", "lineage"]),
      );

      const updateGuard = await client.execute({
        sql: "SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ? AND sql LIKE '%BEFORE UPDATE%'",
        args: [table],
      });
      expect(updateGuard.rows, `${table} must guard immutable provenance`).not.toHaveLength(0);
    }
  });

  it("rejects cross-run and cross-scenario IDs on every derived-parent edge", async () => {
    const client = await migratedClient();
    await insertScenario(client, "scenario-a", "dodo");
    await insertScenario(client, "scenario-b", "github");
    const parent = await seedFullGraph(client, "parent", "scenario-a");
    const unusedDecision = await seedThroughDecision(
      client,
      "unused-decision",
      "scenario-a",
    );
    const unusedExecution = await seedThroughExecution(
      client,
      "unused-execution",
      "scenario-a",
    );
    const unusedVerification = await seedThroughVerification(
      client,
      "unused-verification",
      "scenario-a",
    );

    const freshRun = async (name: string) => {
      const runId = `${name}-run`;
      await insertRun(client, runId, "scenario-b");
      return runId;
    };

    const contextRun = await freshRun("cross-context");
    await expect(
      client.execute({
        sql: "INSERT INTO contexts (context_id, scenario_id, run_id, lineage, task_id, payload, deterministic_tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          "cross-context",
          "scenario-b",
          contextRun,
          lineage(parent.taskId),
          parent.taskId,
          "{}",
          "[]",
          now,
        ],
      }),
      "contexts -> tasks",
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    const decisionRun = await freshRun("cross-decision");
    await expect(
      client.execute({
        sql: "INSERT INTO market_decisions (decision_id, scenario_id, run_id, lineage, selected_bid_id, risk_policy, score_breakdown, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          "cross-decision",
          "scenario-b",
          decisionRun,
          lineage(parent.bidId),
          parent.bidId,
          "{}",
          "{}",
          now,
        ],
      }),
      "market_decisions -> bids",
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    const executionRun = await freshRun("cross-execution");
    await expect(
      client.execute({
        sql: "INSERT INTO tool_executions (execution_id, scenario_id, run_id, lineage, decision_id, adapter_mode, domain, operation, request, raw_evidence, status, latency_ms, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          "cross-execution",
          "scenario-b",
          executionRun,
          lineage(unusedDecision.decisionId),
          unusedDecision.decisionId,
          "simulator",
          "github",
          "fetch_current_state",
          "{}",
          "{}",
          "succeeded",
          5,
          now,
        ],
      }),
      "tool_executions -> market_decisions",
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    const verificationRun = await freshRun("cross-verification");
    await expect(
      client.execute({
        sql: "INSERT INTO verifications (verification_id, scenario_id, run_id, lineage, execution_id, passed, required_postconditions, raw_evidence, policy_violations, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          "cross-verification",
          "scenario-b",
          verificationRun,
          lineage(unusedExecution.executionId),
          unusedExecution.executionId,
          1,
          "[]",
          "{}",
          "[]",
          now,
        ],
      }),
      "verifications -> tool_executions",
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    const settlementBid = await seedThroughVerification(
      client,
      "cross-settlement-bid",
      "scenario-b",
    );
    await expect(
      client.execute({
        sql: "INSERT INTO settlements (settlement_id, scenario_id, run_id, lineage, selected_bid_id, verification_id, predicted_probability, outcome, brier_loss, brier_score, utility, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          "cross-settlement-bid",
          "scenario-b",
          settlementBid.runId,
          lineage(parent.bidId),
          parent.bidId,
          settlementBid.verificationId,
          0.8,
          1,
          0.04,
          0.96,
          10,
          now,
        ],
      }),
      "settlements -> bids",
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    const settlementVerification = await seedThroughVerification(
      client,
      "cross-settlement-verification",
      "scenario-b",
    );
    await expect(
      client.execute({
        sql: "INSERT INTO settlements (settlement_id, scenario_id, run_id, lineage, selected_bid_id, verification_id, predicted_probability, outcome, brier_loss, brier_score, utility, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          "cross-settlement-verification",
          "scenario-b",
          settlementVerification.runId,
          lineage(unusedVerification.verificationId),
          settlementVerification.bidId,
          unusedVerification.verificationId,
          0.8,
          1,
          0.04,
          0.96,
          10,
          now,
        ],
      }),
      "settlements -> verifications",
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    const reputationRun = await freshRun("cross-reputation");
    await expect(
      client.execute({
        sql: "INSERT INTO reputation_buckets (reputation_bucket_id, scenario_id, run_id, lineage, settlement_id, bidder_id, level, bucket_key, score, sample_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          "cross-reputation",
          "scenario-b",
          reputationRun,
          lineage(parent.settlementId),
          parent.settlementId,
          "inspector",
          "global",
          "global",
          0.8,
          1,
          now,
        ],
      }),
      "reputation_buckets -> settlements",
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    const bankrollRun = await freshRun("cross-bankroll");
    await expect(
      client.execute({
        sql: "INSERT INTO bankroll_events (bankroll_event_id, scenario_id, run_id, lineage, settlement_id, bidder_id, stake, brier_score, delta, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          "cross-bankroll",
          "scenario-b",
          bankrollRun,
          lineage(parent.settlementId),
          parent.settlementId,
          "inspector",
          0.5,
          0.96,
          0.23,
          100.23,
          now,
        ],
      }),
      "bankroll_events -> settlements",
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    const metricRun = await freshRun("cross-metric");
    await expect(
      client.execute({
        sql: "INSERT INTO benchmark_metrics (benchmark_metric_id, scenario_id, run_id, lineage, benchmark_run_id, metric, value, sample_size, calculated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          "cross-metric",
          "scenario-b",
          metricRun,
          lineage(parent.benchmarkRunId),
          parent.benchmarkRunId,
          "completion_rate",
          0.8,
          100,
          now,
        ],
      }),
      "benchmark_metrics -> benchmark_runs",
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    const foreignKeyCheck = await client.execute("PRAGMA foreign_key_check");
    expect(foreignKeyCheck.rows).toHaveLength(0);
  });

  it("keeps provenance immutable after insertion", async () => {
    const client = await migratedClient();
    await insertScenario(client, "scenario-1");
    await insertRun(client, "run-1", "scenario-1");
    await client.execute({
      sql: "INSERT INTO tasks (task_id, scenario_id, run_id, lineage, request, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        "task-1",
        "scenario-1",
        "run-1",
        lineage("run-1"),
        "Inspect the payment",
        "{}",
        now,
      ],
    });

    await expect(
      client.execute(
        "UPDATE tasks SET lineage = '{\"parentRecordIds\":[]}' WHERE task_id = 'task-1'",
      ),
    ).rejects.toThrow(/record provenance is immutable/);
  });

  it("rejects unfrozen holdouts and prevents frozen holdout update or deletion", async () => {
    const client = await migratedClient();

    await expect(
      client.execute({
        sql: "INSERT INTO scenarios (scenario_id, domain, split, generator_version, seed, fixture, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: ["holdout-invalid", "dodo", "holdout", "1.0.0", 1, "{}", now],
      }),
    ).rejects.toThrow(/CHECK constraint failed/);

    await client.execute({
      sql: "INSERT INTO scenarios (scenario_id, domain, split, generator_version, seed, fixture, frozen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        "holdout-1",
        "dodo",
        "holdout",
        "1.0.0",
        1,
        "{}",
        now,
        now,
      ],
    });
    await expect(
      client.execute(
        "UPDATE scenarios SET fixture = '{\"changed\":true}' WHERE scenario_id = 'holdout-1'",
      ),
    ).rejects.toThrow(/frozen holdout scenarios are immutable/);
    await expect(
      client.execute("DELETE FROM scenarios WHERE scenario_id = 'holdout-1'"),
    ).rejects.toThrow(/frozen holdout scenarios cannot be deleted/);
  });

  it("makes bidder, tool, and verifier raw audit evidence append-only", async () => {
    const client = await migratedClient();
    await insertScenario(client, "scenario-a");
    const graph = await seedFullGraph(client, "audit", "scenario-a");

    await expect(
      client.execute(
        `UPDATE bids SET raw_output = '{"rewritten":true}' WHERE bid_id = '${graph.bidId}'`,
      ),
    ).rejects.toThrow(/bid audit evidence is immutable/);
    await expect(
      client.execute(
        `UPDATE tool_executions SET raw_evidence = '{"rewritten":true}' WHERE execution_id = '${graph.executionId}'`,
      ),
    ).rejects.toThrow(/tool execution audit evidence is immutable/);
    await expect(
      client.execute(
        `UPDATE verifications SET raw_evidence = '{"rewritten":true}' WHERE verification_id = '${graph.verificationId}'`,
      ),
    ).rejects.toThrow(/verification audit evidence is immutable/);

    await expect(
      client.execute(`DELETE FROM bids WHERE bid_id = '${graph.bidId}'`),
    ).rejects.toThrow(/bid audit evidence cannot be deleted/);
    await expect(
      client.execute(
        `DELETE FROM tool_executions WHERE execution_id = '${graph.executionId}'`,
      ),
    ).rejects.toThrow(/tool execution audit evidence cannot be deleted/);
    await expect(
      client.execute(
        `DELETE FROM verifications WHERE verification_id = '${graph.verificationId}'`,
      ),
    ).rejects.toThrow(/verification audit evidence cannot be deleted/);
  });
});
