import { z } from "zod";

import {
  identifierSchema,
  lineageSchema,
} from "@/core/contracts";
import {
  parseServerEnvironment,
  type EnvironmentSource,
  type ServerEnvironment,
} from "@/config/env";

const reasonArgumentsSchema = z
  .object({ reason: z.string().min(1) })
  .strict()
  .readonly();

const dodoActionSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("fetch_current_state"),
      arguments: z
        .object({
          resource: z.enum(["payment", "subscription"]),
          resourceId: identifierSchema,
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      operation: z.literal("refund"),
      arguments: z
        .object({
          paymentId: identifierSchema,
          idempotencyKey: identifierSchema,
          amountMinor: z.number().int().positive().optional(),
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      operation: z.literal("cancel_subscription"),
      arguments: z
        .object({
          subscriptionId: identifierSchema,
          idempotencyKey: identifierSchema,
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({ operation: z.literal("no_op"), arguments: reasonArgumentsSchema })
    .strict()
    .readonly(),
  z
    .object({
      operation: z.literal("escalate"),
      arguments: reasonArgumentsSchema,
    })
    .strict()
    .readonly(),
]);

const githubTargetShape = {
  owner: identifierSchema,
  repo: identifierSchema,
  issueNumber: z.number().int().positive(),
};

const githubTargetSchema = z
  .object(githubTargetShape)
  .strict()
  .readonly();

const githubActionSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("fetch_current_state"),
      arguments: githubTargetSchema,
    })
    .strict()
    .readonly(),
  z
    .object({
      operation: z.literal("add_label"),
      arguments: z
        .object({
          ...githubTargetShape,
          label: z.string().min(1),
          idempotencyKey: identifierSchema,
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      operation: z.literal("remove_label"),
      arguments: z
        .object({
          ...githubTargetShape,
          label: z.string().min(1),
          idempotencyKey: identifierSchema,
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      operation: z.literal("close_issue"),
      arguments: z
        .object({
          ...githubTargetShape,
          idempotencyKey: identifierSchema,
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({ operation: z.literal("no_op"), arguments: reasonArgumentsSchema })
    .strict()
    .readonly(),
  z
    .object({
      operation: z.literal("escalate"),
      arguments: reasonArgumentsSchema,
    })
    .strict()
    .readonly(),
]);

const toolCallIdentityShape = {
  callId: identifierSchema,
  scenarioId: identifierSchema,
  runId: identifierSchema,
  lineage: lineageSchema,
};

export const toolCallSchema = z.discriminatedUnion("domain", [
  z
    .object({
      ...toolCallIdentityShape,
      domain: z.literal("dodo"),
      action: dodoActionSchema,
    })
    .strict()
    .readonly(),
  z
    .object({
      ...toolCallIdentityShape,
      domain: z.literal("github"),
      action: githubActionSchema,
    })
    .strict()
    .readonly(),
]);

export const toolResultSchema = z
  .object({
    executionId: identifierSchema,
    callId: identifierSchema,
    scenarioId: identifierSchema,
    runId: identifierSchema,
    lineage: lineageSchema,
    status: z.enum(["succeeded", "failed", "ambiguous"]),
    state: z.record(z.string(), z.unknown()),
    rawEvidence: z.json(),
    latencyMs: z.number().int().nonnegative(),
    error: z.string().min(1).optional(),
  })
  .strict()
  .readonly();

export type ToolCall = z.infer<typeof toolCallSchema>;
export type ToolResult = z.infer<typeof toolResultSchema>;
export type ToolMode = ServerEnvironment["CALLMARKET_TOOL_MODE"];

export interface ToolAdapterImplementation {
  readonly mode: ToolMode;
  execute(call: ToolCall): Promise<unknown>;
}

export interface ToolAdapter {
  readonly mode: ToolMode;
  execute(call: unknown): Promise<ToolResult>;
}

export class LiveWriteDisabledError extends Error {
  constructor() {
    super(
      "External mutations are disabled; set ALLOW_LIVE_TEST_WRITES=true only for disposable test resources.",
    );
    this.name = "LiveWriteDisabledError";
  }
}

export function isMutation(call: ToolCall): boolean {
  return !["fetch_current_state", "no_op", "escalate"].includes(
    call.action.operation,
  );
}

function validateResultLineage(call: ToolCall, result: ToolResult): void {
  if (
    result.callId !== call.callId ||
    result.scenarioId !== call.scenarioId ||
    result.runId !== call.runId ||
    !result.lineage.parentRecordIds.includes(call.callId)
  ) {
    throw new Error("Tool result changed immutable call provenance.");
  }
}

/**
 * The sole construction boundary for simulator/live implementations. Simulator
 * mode is the default; live mutations are rejected before an adapter is called.
 */
export function createToolAdapter(
  implementations: {
    simulator: ToolAdapterImplementation;
    live?: ToolAdapterImplementation;
  },
  source: EnvironmentSource = process.env,
): ToolAdapter {
  const environment = parseServerEnvironment(source);
  const implementation =
    environment.CALLMARKET_TOOL_MODE === "simulator"
      ? implementations.simulator
      : implementations.live;

  if (!implementation) {
    throw new Error("Live tool mode was requested without a live adapter.");
  }

  if (implementation.mode !== environment.CALLMARKET_TOOL_MODE) {
    throw new Error("Configured tool mode does not match the selected adapter.");
  }

  return {
    mode: implementation.mode,
    async execute(input: unknown) {
      const call = toolCallSchema.parse(input);

      if (
        implementation.mode === "live" &&
        isMutation(call) &&
        !environment.ALLOW_LIVE_TEST_WRITES
      ) {
        throw new LiveWriteDisabledError();
      }

      const result = toolResultSchema.parse(await implementation.execute(call));
      validateResultLineage(call, result);
      return result;
    },
  };
}
