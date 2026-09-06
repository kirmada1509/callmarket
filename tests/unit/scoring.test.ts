import { describe, expect, it } from "vitest";

import {
  brierScore,
  effectiveReputation,
  scoreBid,
} from "@/core/scoring";
import type { Bid, TaskContext } from "@/core/types";

const context: TaskContext = {
  taskId: "scenario-1",
  domain: "dodo",
  operationClass: "irreversible_write",
  capabilityTags: ["stale_event", "stateful_mutation"],
  eventAgeBucket: "stale",
  stateVolatility: "high",
  schemaHealth: "valid",
  ambiguity: "high",
  failureCost: 120,
  latencyBudgetMs: 2_000,
  tokenBudget: 2_000,
};

const bid: Bid = {
  bidderId: "inspector",
  action: { tool: "fetch_current_state", arguments: {} },
  predictedPostconditions: [{ path: "payment.status", operator: "unchanged" }],
  successProbability: 0.8,
  expectedTokens: 1_000,
  expectedLatencyMs: 1_000,
  stake: 0.5,
  rationale: "Refresh volatile state before a costly write.",
};

describe("effectiveReputation", () => {
  it("shrinks an unsupported exact context toward broader evidence", () => {
    const sparse = effectiveReputation({
      globalScore: 0.6,
      globalSamples: 100,
      capabilityScore: 0.7,
      capabilitySamples: 20,
      exactContextScore: 1,
      exactContextSamples: 0,
    });
    const supported = effectiveReputation({
      globalScore: 0.6,
      globalSamples: 100,
      capabilityScore: 0.7,
      capabilitySamples: 20,
      exactContextScore: 1,
      exactContextSamples: 5,
    });

    expect(sparse).toBeCloseTo(0.67);
    expect(supported).toBeCloseTo(0.85);
  });
});

describe("scoreBid", () => {
  it("exposes every term in the deterministic selection score", () => {
    const result = scoreBid(context, bid, 0.7);

    expect(result.calibratedSuccess).toBeCloseTo(0.765);
    expect(result.total).toBeCloseTo(42.3);
    expect(result.total).toBeCloseTo(
      result.expectedValue -
        result.failurePenalty -
        result.tokenPenalty -
        result.latencyPenalty +
        result.stakeBonus,
    );
  });
});

describe("brierScore", () => {
  it("penalizes confident wrong forecasts more heavily", () => {
    expect(brierScore(0.9, 0)).toBeLessThan(brierScore(0.6, 0));
    expect(brierScore(0.9, 1)).toBeCloseTo(0.99);
  });
});
