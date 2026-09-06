import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const clients: Client[] = [];

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
    }

    const provenanceTriggers = await client.execute(
      "SELECT tbl_name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE '%provenance_immutable' ORDER BY tbl_name",
    );
    expect(provenanceTriggers.rows.map((row) => row.tbl_name)).toEqual(
      [...derivedTables].sort(),
    );
  });

  it("enforces matching run/scenario provenance and immutable lineage", async () => {
    const client = await migratedClient();
    const now = Date.now();

    await client.execute({
      sql: "INSERT INTO scenarios (scenario_id, domain, split, generator_version, seed, fixture, frozen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        "scenario-1",
        "dodo",
        "train",
        "1.0.0",
        1,
        "{}",
        null,
        now,
      ],
    });
    await client.execute({
      sql: "INSERT INTO scenarios (scenario_id, domain, split, generator_version, seed, fixture, frozen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        "scenario-2",
        "github",
        "train",
        "1.0.0",
        2,
        "{}",
        null,
        now,
      ],
    });
    await client.execute({
      sql: "INSERT INTO runs (run_id, scenario_id, lineage, condition, seed, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        "run-1",
        "scenario-1",
        '{"parentRecordIds":["scenario-1"]}',
        "callmarket",
        1,
        "running",
        now,
      ],
    });
    await client.execute({
      sql: "INSERT INTO runs (run_id, scenario_id, lineage, condition, seed, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        "run-2",
        "scenario-1",
        '{"parentRecordIds":["scenario-1"]}',
        "callmarket",
        2,
        "running",
        now,
      ],
    });
    await client.execute({
      sql: "INSERT INTO tasks (task_id, scenario_id, run_id, lineage, request, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        "task-1",
        "scenario-1",
        "run-1",
        '{"parentRecordIds":["run-1"]}',
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
    await expect(
      client.execute({
        sql: "INSERT INTO tasks (task_id, scenario_id, run_id, lineage, request, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [
          "task-mismatch",
          "scenario-2",
          "run-2",
          '{"parentRecordIds":["run-2"]}',
          "Mismatched provenance",
          "{}",
          now,
        ],
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("rejects unfrozen holdouts and prevents frozen holdout mutation", async () => {
    const client = await migratedClient();
    const now = Date.now();

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
  });
});
