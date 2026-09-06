import { z } from "zod";

export const serverEnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1).default("file:local.db"),
    CALLMARKET_TOOL_MODE: z.enum(["simulator", "live"]).default("simulator"),
    ALLOW_LIVE_TEST_WRITES: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .strict()
  .readonly();

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/** Parse only declared server settings so unrelated process variables are not exposed. */
export function parseServerEnvironment(
  source: EnvironmentSource = process.env,
): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    DATABASE_URL: source.DATABASE_URL,
    CALLMARKET_TOOL_MODE: source.CALLMARKET_TOOL_MODE,
    ALLOW_LIVE_TEST_WRITES: source.ALLOW_LIVE_TEST_WRITES,
  });
}
