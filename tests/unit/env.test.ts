import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "@/config/env";

describe("server environment boundary", () => {
  it("defaults to local storage, simulators, and disabled live writes", () => {
    expect(parseServerEnvironment({})).toEqual({
      DATABASE_URL: "file:local.db",
      CALLMARKET_TOOL_MODE: "simulator",
      ALLOW_LIVE_TEST_WRITES: false,
    });
  });

  it("rejects non-exact live-write flags", () => {
    expect(() =>
      parseServerEnvironment({ ALLOW_LIVE_TEST_WRITES: "1" }),
    ).toThrow();
  });
});
