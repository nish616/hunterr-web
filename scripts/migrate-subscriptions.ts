#!/usr/bin/env tsx
/**
 * One-shot migration: grandfather every existing user into the Pro tier.
 *
 *   npm run migrate-subscriptions
 *
 * Run AFTER drizzle-kit push has added the `subscription` column. New
 * signups created after this script runs default to Free per the schema
 * (`DEFAULT_SUBSCRIPTION`); only pre-existing rows need to be flipped.
 *
 * Idempotent — running it twice on the same DB will just re-set
 * everyone to Pro with a fresh `upgradedAt`. Safe to re-run.
 */
import { db, schema } from "../src/lib/db";
import { Tier } from "@/lib/constants";

async function main() {
  const now = new Date().toISOString();

  const rows = await db
    .update(schema.users)
    .set({
      subscription: {
        tier: Tier.Pro,
        upgradedAt: now,
      },
    })
    .returning({ id: schema.users.id, email: schema.users.email });

  console.log(`Grandfathered ${rows.length} user(s) into Pro:`);
  for (const r of rows) {
    console.log(`  ${r.email}  (${r.id})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
