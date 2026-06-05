import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Subscription } from "@/lib/db/schema";
import { DEFAULT_SUBSCRIPTION } from "@/lib/db/schema";


export async function getSubscription(userId: string): Promise<Subscription> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { subscription: true },
  });
  return row?.subscription ?? DEFAULT_SUBSCRIPTION;
}
