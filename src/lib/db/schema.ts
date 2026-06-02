import { pgTable, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Per-user preferences. Stored as JSON so we can add new keys (skills,
 * locations, etc.) later without schema migrations.
 */
export interface UserPreferences {
  preferredTitles?: string; // comma-separated, raw from input
  excludedTitles?: string;
  skills?: string; // comma-separated; overrides default SKILL_KEYWORDS when set
  maxAgeDays?: number; // posting age cutoff; 0 = no limit. Overrides default.
  // Public profile links — surfaced to the deep-dive agent so cover letters can
  // reference them, and shown on the profile page so the user can copy/paste
  // them when applying.
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
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

export type DeepDiveSectionKind =
  | "company_brief"
  | "tech_stack_reality_check"
  | "deep_gap_analysis"
  | "cover_letter"
  | "resume_rewrites"
  | "questions_to_ask";

export interface DeepDiveSection {
  content: string;
  savedAt: number;
}

export type DeepDiveSections = Partial<Record<DeepDiveSectionKind, DeepDiveSection>>;

export type DeepDiveStatus = "running" | "complete" | "failed";

export const jobDeepDives = pgTable(
  "job_deep_dives",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Job identity — URL is the most stable natural key across ATS sources.
    jobUrl: text("job_url").notNull(),
    jobCompany: text("job_company").notNull(),
    jobTitle: text("job_title").notNull(),
    status: text("status").$type<DeepDiveStatus>().notNull().default("running"),
    sections: jsonb("sections").$type<DeepDiveSections>().notNull().default({}),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("job_deep_dives_user_url_uniq").on(t.userId, t.jobUrl)],
);

export type JobDeepDive = typeof jobDeepDives.$inferSelect;
export type NewJobDeepDive = typeof jobDeepDives.$inferInsert;
