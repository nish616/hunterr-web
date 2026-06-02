import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Per-user preferences. Stored as JSON so we can add new keys (skills,
 * locations, etc.) later without schema migrations.
 */
export interface UserPreferences {
  preferredTitles?: string; // comma-separated, raw from input
  excludedTitles?: string;
  skills?: string; // comma-separated; overrides default SKILL_KEYWORDS when set
  maxAgeDays?: number; // posting age cutoff; 0 = no limit. Overrides default.
}

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // JSON blob; empty / null = use defaults.
  preferences: jsonb("preferences").$type<UserPreferences>(),
  // Résumé stored in the DB (not on disk) so it survives serverless deploys.
  resumeText: text("resume_text"),
  resumeProfile: text("resume_profile"),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
