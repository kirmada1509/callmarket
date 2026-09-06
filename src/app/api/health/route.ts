import { parseServerEnvironment } from "@/config/env";
import { healthResponseSchema } from "@/core/contracts";

export function GET() {
  const environment = parseServerEnvironment();
  const response = healthResponseSchema.parse({
    status: "ok",
    toolMode: environment.CALLMARKET_TOOL_MODE,
  });

  return Response.json(response);
}
