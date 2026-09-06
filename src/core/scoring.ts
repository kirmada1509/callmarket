import type { Bid, ReputationEvidence, TaskContext } from "./types";

export type RiskPolicy = {
  taskValue: number;
  tokenWeight: number;
  latencyWeight: number;
  stakeWeight: number;
  exactContextMinSamples: number;
};

export const defaultRiskPolicy: RiskPolicy = {
  taskValue: 100,
  tokenWeight: 8,
  latencyWeight: 6,
  stakeWeight: 2,
  exactContextMinSamples: 5,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function effectiveReputation(
  evidence: ReputationEvidence,
  minimumExactSamples = 5,
): number {
  const exactSupport = clamp01(evidence.exactContextSamples / minimumExactSamples);
  const exactWeight = 0.55 * exactSupport;
  const releasedWeight = 0.55 - exactWeight;
  const capabilityWeight = 0.3 + releasedWeight * 0.7;
  const globalWeight = 0.15 + releasedWeight * 0.3;

  return clamp01(
    exactWeight * evidence.exactContextScore +
      capabilityWeight * evidence.capabilityScore +
      globalWeight * evidence.globalScore,
  );
}

export type SelectionBreakdown = {
  calibratedSuccess: number;
  expectedValue: number;
  failurePenalty: number;
  tokenPenalty: number;
  latencyPenalty: number;
  stakeBonus: number;
  total: number;
};

export function scoreBid(
  context: TaskContext,
  bid: Bid,
  reputation: number,
  policy: RiskPolicy = defaultRiskPolicy,
): SelectionBreakdown {
  const calibratedSuccess =
    0.65 * bid.successProbability + 0.35 * clamp01(reputation);
  const expectedValue = calibratedSuccess * policy.taskValue;
  const failurePenalty = (1 - calibratedSuccess) * context.failureCost;
  const tokenPenalty =
    policy.tokenWeight * clamp01(bid.expectedTokens / context.tokenBudget);
  const latencyPenalty =
    policy.latencyWeight *
    clamp01(bid.expectedLatencyMs / context.latencyBudgetMs);
  const stakeBonus = policy.stakeWeight * clamp01(bid.stake);

  return {
    calibratedSuccess,
    expectedValue,
    failurePenalty,
    tokenPenalty,
    latencyPenalty,
    stakeBonus,
    total:
      expectedValue -
      failurePenalty -
      tokenPenalty -
      latencyPenalty +
      stakeBonus,
  };
}

export function brierScore(probability: number, outcome: 0 | 1): number {
  return 1 - (clamp01(probability) - outcome) ** 2;
}
