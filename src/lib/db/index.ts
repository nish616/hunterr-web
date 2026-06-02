import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (Neon Postgres connection string).");
}

// Neon's HTTP driver is stateless — perfect for serverless (Vercel). Every
// function invocation makes independent HTTP queries; no connection pool to
// manage and no persistent socket that a frozen container would leak.
const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export { schema };
