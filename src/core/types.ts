import { z } from "zod";

export const domainSchema = z.enum(["dodo", "github"]);
export const bidderIdSchema = z.enum(["sprinter", "inspector", "skeptic"]);
export const operationClassSchema = z.enum([
  "read",
  "reversible_write",
  "irreversible_write",
]);
export const levelSchema = z.enum(["low", "medium", "high"]);

export const taskContextSchema = z.object({
  taskId: z.string().min(1),
  domain: domainSchema,
  operationClass: operationClassSchema,
  capabilityTags: z.array(z.string().min(1)).min(1).readonly(),
  eventAgeBucket: z.enum(["fresh", "stale", "unknown"]),
  stateVolatility: levelSchema,
  schemaHealth: z.enum(["valid", "malformed", "unknown"]),
  ambiguity: levelSchema,
  failureCost: z.number().finite().nonnegative(),
  latencyBudgetMs: z.number().int().positive(),
  tokenBudget: z.number().int().positive(),
}).strict().readonly();

export const postconditionSchema = z.object({
  path: z.string().min(1),
  operator: z.enum(["eq", "neq", "contains", "unchanged"]),
  value: z.unknown().optional(),
}).strict().readonly();

export const bidSchema = z.object({
  bidderId: bidderIdSchema,
  action: z.object({
    tool: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()),
  }).strict().readonly(),
  predictedPostconditions: z.array(postconditionSchema).min(1).readonly(),
  successProbability: z.number().finite().min(0.01).max(0.99),
  expectedTokens: z.number().int().nonnegative(),
  expectedLatencyMs: z.number().int().nonnegative(),
  stake: z.number().finite().nonnegative(),
  rationale: z.string().min(1),
}).strict().readonly();

export type Domain = z.infer<typeof domainSchema>;
export type BidderId = z.infer<typeof bidderIdSchema>;
export type TaskContext = z.infer<typeof taskContextSchema>;
export type Bid = z.infer<typeof bidSchema>;

export type ReputationEvidence = {
  globalScore: number;
  globalSamples: number;
  capabilityScore: number;
  capabilitySamples: number;
  exactContextScore: number;
  exactContextSamples: number;
};
