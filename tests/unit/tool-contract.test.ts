import { describe, expect, it, vi } from "vitest";

import {
  createToolAdapter,
  LiveWriteDisabledError,
  type ToolAdapterImplementation,
  type ToolCall,
} from "@/tools/contract";

const mutationCall = {
  callId: "call-1",
  scenarioId: "scenario-1",
  runId: "run-1",
  lineage: { parentRecordIds: ["decision-1"] },
  domain: "dodo",
  action: {
    operation: "refund",
    arguments: {
      paymentId: "payment-1",
      idempotencyKey: "refund-run-1",
    },
  },
} as const satisfies ToolCall;

const readCall = {
  ...mutationCall,
  action: {
    operation: "fetch_current_state",
    arguments: { resource: "payment", resourceId: "payment-1" },
  },
} as const satisfies ToolCall;

function resultFor(call: ToolCall) {
  return {
    executionId: "execution-1",
    callId: call.callId,
    scenarioId: call.scenarioId,
    runId: call.runId,
    lineage: { parentRecordIds: [call.callId] },
    status: "succeeded",
    state: { status: "refunded" },
    rawEvidence: { source: "fixture" },
    latencyMs: 5,
  } as const;
}

function implementation(mode: "simulator" | "live") {
  return {
    mode,
    execute: vi.fn(async (call: ToolCall) => resultFor(call)),
  } satisfies ToolAdapterImplementation;
}

describe("tool adapter boundary", () => {
  it("uses the deterministic simulator by default", async () => {
    const simulator = implementation("simulator");
    const live = implementation("live");
    const adapter = createToolAdapter({ simulator, live }, {});

    await expect(adapter.execute(mutationCall)).resolves.toMatchObject({
      scenarioId: "scenario-1",
      runId: "run-1",
      status: "succeeded",
    });
    expect(adapter.mode).toBe("simulator");
    expect(simulator.execute).toHaveBeenCalledOnce();
    expect(live.execute).not.toHaveBeenCalled();
  });

  it("blocks live external mutations before invoking the adapter", async () => {
    const live = implementation("live");
    const adapter = createToolAdapter(
      { simulator: implementation("simulator"), live },
      { CALLMARKET_TOOL_MODE: "live" },
    );

    await expect(adapter.execute(mutationCall)).rejects.toBeInstanceOf(
      LiveWriteDisabledError,
    );
    expect(live.execute).not.toHaveBeenCalled();
  });

  it("allows live reads while writes remain disabled", async () => {
    const live = implementation("live");
    const adapter = createToolAdapter(
      { simulator: implementation("simulator"), live },
      { CALLMARKET_TOOL_MODE: "live", ALLOW_LIVE_TEST_WRITES: "false" },
    );

    await expect(adapter.execute(readCall)).resolves.toMatchObject({
      callId: "call-1",
    });
    expect(live.execute).toHaveBeenCalledOnce();
  });

  it("allows a live mutation only when the flag is exactly true", async () => {
    const live = implementation("live");
    const adapter = createToolAdapter(
      { simulator: implementation("simulator"), live },
      {
        CALLMARKET_TOOL_MODE: "live",
        ALLOW_LIVE_TEST_WRITES: "true",
      },
    );

    await expect(adapter.execute(mutationCall)).resolves.toMatchObject({
      status: "succeeded",
    });
    expect(live.execute).toHaveBeenCalledOnce();
    expect(() =>
      createToolAdapter(
        { simulator: implementation("simulator"), live },
        {
          CALLMARKET_TOOL_MODE: "live",
          ALLOW_LIVE_TEST_WRITES: "TRUE",
        },
      ),
    ).toThrow();
  });

  it("validates results and rejects changed provenance", async () => {
    const simulator = implementation("simulator");
    simulator.execute.mockResolvedValueOnce({
      ...resultFor(mutationCall),
      runId: "different-run",
    });
    const adapter = createToolAdapter({ simulator }, {});

    await expect(adapter.execute(mutationCall)).rejects.toThrow(
      "Tool result changed immutable call provenance.",
    );
  });

  it("rejects malformed calls at the boundary", async () => {
    const simulator = implementation("simulator");
    const adapter = createToolAdapter({ simulator }, {});

    await expect(
      adapter.execute({ ...mutationCall, extraField: true }),
    ).rejects.toThrow();
    expect(simulator.execute).not.toHaveBeenCalled();
  });
});
