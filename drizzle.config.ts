import { defineConfig } from "drizzle-kit";

import { parseServerEnvironment } from "./src/config/env";

const environment = parseServerEnvironment();

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: environment.DATABASE_URL,
  },
});
