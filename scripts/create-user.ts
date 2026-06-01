#!/usr/bin/env tsx
/**
 * Create a user account.
 *
 *   npm run create-user -- nishin@example.com mypassword "Nishin S"
 *
 * The name argument is optional.
 */
import bcrypt from "bcryptjs";
import { db, schema } from "../src/lib/db";

async function main() {
  const [emailArg, passwordArg, nameArg] = process.argv.slice(2);

  if (!emailArg || !passwordArg) {
    console.error("Usage: npm run create-user -- <email> <password> [name]");
    process.exit(1);
  }

  const email = emailArg.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(passwordArg, 10);

  try {
    await db
      .insert(schema.users)
      .values({
        email,
        passwordHash,
        name: nameArg ?? null,
      })
      .returning();

  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      console.error(`✗ User ${email} already exists`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
