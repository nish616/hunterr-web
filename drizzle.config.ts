import { existsSync } from "node:fs";
import type { Config } from "drizzle-kit";

// drizzle-kit doesn't auto-load .env.local; load it so DATABASE_URL is available.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
