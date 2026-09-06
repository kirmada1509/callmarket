import { z } from "zod";

import {
  bidSchema,
  bidderIdSchema,
  domainSchema,
  taskContextSchema,
} from "./types";

const identifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

export const identifierSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(identifierPattern, "must be an opaque identifier without whitespace");

export const lineageSchema = z
  .object({
    parentRecordIds: z.array(identifierSchema).readonly(),
  })
  .strict()
  .readonly();

const derivedRecordIdentityShape = {
  recordId: identifierSchema,
  scenarioId: identifierSchema,
  runId: identifierSchema,
  lineage: lineageSchema,
};

export const derivedRecordIdentitySchema = z
  .object(derivedRecordIdentityShape)
  .strict()
  .readonly();

export const taskRecordSchema = z
  .object({
    ...derivedRecordIdentityShape,
    task: z
      .object({
        taskId: identifierSchema,
        request: z.string().min(1),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export const contextRecordSchema = z
  .object({
    ...derivedRecordIdentityShape,
    context: taskContextSchema,
  })
  .strict()
  .readonly();

const usageSchema = z
  .object({
    tokens: z.number().int().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
  })
  .strict()
  .readonly();

const validBidAttemptSchema = z
  .object({
    ...derivedRecordIdentityShape,
    bidderId: bidderIdSchema,
    status: z.literal("valid"),
    rawOutput: z.json(),
    bid: bidSchema,
    validationIssues: z.tuple([]),
    usage: usageSchema,
  })
  .strict()
  .readonly();

const invalidBidAttemptSchema = z
  .object({
    ...derivedRecordIdentityShape,
    bidderId: bidderIdSchema,
    status: z.literal("invalid"),
    rawOutput: z.json(),
    validationIssues: z.array(z.string().min(1)).min(1).readonly(),
    usage: usageSchema,
  })
  .strict()
  .readonly();

/**
 * The bidder/LLM output boundary. Invalid output remains representable with its
 * actual token and latency cost so downstream settlement cannot drop failures.
 */
export const bidAttemptRecordSchema = z.discriminatedUnion("status", [
  validBidAttemptSchema,
  invalidBidAttemptSchema,
]).superRefine((attempt, context) => {
  if (attempt.status === "valid" && attempt.bidderId !== attempt.bid.bidderId) {
    context.addIssue({
      code: "custom",
      path: ["bid", "bidderId"],
      message: "validated bid must belong to the recorded bidder",
    });
  }
});

export const scenarioSplitSchema = z.enum(["train", "holdout"]);

export const scenarioSchema = z
  .object({
    scenarioId: identifierSchema,
    generatorVersion: z.string().min(1),
    seed: z.number().int().nonnegative(),
    domain: domainSchema,
    split: scenarioSplitSchema,
    fixture: z.record(z.string(), z.unknown()),
    frozenAt: z.iso.datetime().nullable(),
  })
  .strict()
  .superRefine((scenario, context) => {
    if (scenario.split === "holdout" && scenario.frozenAt === null) {
      context.addIssue({
        code: "custom",
        path: ["frozenAt"],
        message: "holdout scenarios must be frozen before use",
      });
    }
  })
  .readonly();

export const datasetManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatorVersion: z.string().min(1),
    split: scenarioSplitSchema,
    contentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    scenarioIds: z.array(identifierSchema).min(1).readonly(),
    frozenAt: z.iso.datetime().nullable(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (new Set(manifest.scenarioIds).size !== manifest.scenarioIds.length) {
      context.addIssue({
        code: "custom",
        path: ["scenarioIds"],
        message: "scenario IDs must be unique",
      });
    }

    if (manifest.split === "holdout" && manifest.frozenAt === null) {
      context.addIssue({
        code: "custom",
        path: ["frozenAt"],
        message: "holdout manifests must be frozen before use",
      });
    }
  })
  .readonly();

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    toolMode: z.enum(["simulator", "live"]),
  })
  .strict()
  .readonly();

export type DerivedRecordIdentity = z.infer<
  typeof derivedRecordIdentitySchema
>;
export type TaskRecord = z.infer<typeof taskRecordSchema>;
export type ContextRecord = z.infer<typeof contextRecordSchema>;
export type BidAttemptRecord = z.infer<typeof bidAttemptRecordSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type DatasetManifest = z.infer<typeof datasetManifestSchema>;
