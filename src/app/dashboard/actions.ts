"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/lib/db";
import type { UserPreferences } from "@/lib/db/schema";

export async function savePreferencesAction(
  prefs: UserPreferences,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not signed in" };

  try {
    await db
      .update(schema.users)
      .set({ preferences: prefs })
      .where(eq(schema.users.id, session.user.id));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save failed",
    };
  }
}
