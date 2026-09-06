import { describe, expect, it } from "vitest";

import {
  bidAttemptRecordSchema,
  contextRecordSchema,
  datasetManifestSchema,
  derivedRecordIdentitySchema,
  healthResponseSchema,
  scenarioSchema,
  taskRecordSchema,
} from "@/core/contracts";
import { bidSchema, taskContextSchema } from "@/core/types";

const identity = {
  recordId: "bid-1",
  scenarioId: "scenario-1",
  runId: "run-1",
  lineage: { parentRecordIds: ["context-1"] },
} as const;

const bid = {
  bidderId: "inspector",
  action: { tool: "fetch_current_state", arguments: {} },
  predictedPostconditions: [
    { path: "payment.status", operator: "unchanged" },
  ],
  successProbability: 0.8,
  expectedTokens: 320,
  expectedLatencyMs: 450,
  stake: 0.4,
  rationale: "Refresh state before deciding.",
} as const;

describe("shared boundary contracts", () => {
  it("strictly validates and freezes task contexts and LLM bids", () => {
    const context = taskContextSchema.parse({
      taskId: "task-1",
      domain: "dodo",
      operationClass: "irreversible_write",
      capabilityTags: ["stateful_mutation"],
      eventAgeBucket: "stale",
      stateVolatility: "high",
      schemaHealth: "valid",
      ambiguity: "medium",
      failureCost: 100,
      latencyBudgetMs: 1_000,
      tokenBudget: 2_000,
    });
    const parsedBid = bidSchema.parse(bid);

    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(parsedBid)).toBe(true);
    expect(Object.isFrozen(parsedBid.predictedPostconditions)).toBe(true);
    expect(
      taskContextSchema.safeParse({ ...context, undocumented: true }).success,
    ).toBe(false);
    expect(
      bidSchema.safeParse({ ...bid, successProbability: Number.NaN }).success,
    ).toBe(false);
  });

  it("keeps derived record provenance immutable at the boundary", () => {
    const parsed = derivedRecordIdentitySchema.parse(identity);

    expect(parsed).toEqual(identity);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.lineage)).toBe(true);
    expect(Object.isFrozen(parsed.lineage.parentRecordIds)).toBe(true);
    expect(
      derivedRecordIdentitySchema.safeParse({ ...identity, scenarioId: "" })
        .success,
    ).toBe(false);
  });

  it("validates task, context, and route response envelopes", () => {
    expect(
      taskRecordSchema.parse({
        ...identity,
        task: { taskId: "task-1", request: "Inspect current state" },
      }).scenarioId,
    ).toBe("scenario-1");
    expect(
      contextRecordSchema.safeParse({
        ...identity,
        context: {
          taskId: "task-1",
          domain: "github",
          operationClass: "reversible_write",
          capabilityTags: ["stateful_mutation"],
          eventAgeBucket: "fresh",
          stateVolatility: "medium",
          schemaHealth: "valid",
          ambiguity: "low",
          failureCost: 25,
          latencyBudgetMs: 1_000,
          tokenBudget: 1_000,
        },
      }).success,
    ).toBe(true);
    expect(
      healthResponseSchema.safeParse({
        status: "ok",
        toolMode: "simulator",
        unvalidated: true,
      }).success,
    ).toBe(false);
  });

  it("records invalid bidder output with its token and latency cost", () => {
    const attempt = bidAttemptRecordSchema.parse({
      ...identity,
      bidderId: "sprinter",
      status: "invalid",
      rawOutput: "not-json",
      validationIssues: ["Expected an object"],
      usage: { tokens: 91, latencyMs: 17 },
    });

    expect(attempt.status).toBe("invalid");
    expect(attempt.usage).toEqual({ tokens: 91, latencyMs: 17 });
    expect(
      bidAttemptRecordSchema.safeParse({
        ...identity,
        bidderId: "sprinter",
        status: "invalid",
        rawOutput: "not-json",
        validationIssues: [],
        usage: { tokens: 91, latencyMs: 17 },
      }).success,
    ).toBe(false);
  });

  it("accepts valid bidder attempts only with a validated bid", () => {
    const attempt = bidAttemptRecordSchema.parse({
      ...identity,
      bidderId: "inspector",
      status: "valid",
      rawOutput: bid,
      bid,
      validationIssues: [],
      usage: { tokens: 320, latencyMs: 450 },
    });

    expect(attempt.status).toBe("valid");
    expect(
      bidAttemptRecordSchema.safeParse({
        ...identity,
        bidderId: "sprinter",
        status: "valid",
        rawOutput: bid,
        bid,
        validationIssues: [],
        usage: { tokens: 320, latencyMs: 450 },
      }).success,
    ).toBe(false);
  });
});

describe("dataset boundaries", () => {
  const digest = `sha256:${"a".repeat(64)}`;

  it("requires holdout scenarios and manifests to be frozen", () => {
    expect(
      scenarioSchema.safeParse({
        scenarioId: "holdout-1",
        generatorVersion: "1.0.0",
        seed: 42,
        domain: "github",
        split: "holdout",
        fixture: {},
        frozenAt: null,
      }).success,
    ).toBe(false);

    expect(
      datasetManifestSchema.safeParse({
        schemaVersion: 1,
        generatorVersion: "1.0.0",
        split: "holdout",
        contentDigest: digest,
        scenarioIds: ["holdout-1"],
        frozenAt: null,
      }).success,
    ).toBe(false);
  });

  it("accepts a frozen, content-addressed holdout manifest", () => {
    const manifest = datasetManifestSchema.parse({
      schemaVersion: 1,
      generatorVersion: "1.0.0",
      split: "holdout",
      contentDigest: digest,
      scenarioIds: ["holdout-1", "holdout-2"],
      frozenAt: "2026-09-06T10:00:00.000Z",
    });

    expect(manifest.scenarioIds).toHaveLength(2);
    expect(Object.isFrozen(manifest)).toBe(true);
  });

  it("rejects duplicate scenario IDs", () => {
    expect(
      datasetManifestSchema.safeParse({
        schemaVersion: 1,
        generatorVersion: "1.0.0",
        split: "train",
        contentDigest: digest,
        scenarioIds: ["scenario-1", "scenario-1"],
        frozenAt: null,
      }).success,
    ).toBe(false);
  });
});
