import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  // JSON blob; empty / null = use defaults. Drizzle handles JSON.stringify/parse.
  preferences: text("preferences", { mode: "json" }).$type<UserPreferences>(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
