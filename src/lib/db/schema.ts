import { pgTable, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { Tier } from "../constants";

export type SubscriptionTier = Tier;

export interface Subscription {
  tier: SubscriptionTier;
  upgradedAt?: string;
}

/**
 * Default subscription for a brand-new signup — Free tier, no AI access.
 */
export const DEFAULT_SUBSCRIPTION: Subscription = { tier: Tier.Free };

/**
 * Per-user preferences. Stored as JSON so we can add new keys (skills,
 * locations, etc.) later without schema migrations.
 */
export interface UserPreferences {
  preferredTitles?: string; // comma-separated, raw from input
  excludedTitles?: string;
  skills?: string; // comma-separated; overrides default SKILL_KEYWORDS when set
  maxAgeDays?: number;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  autoRunEnabled?: boolean;
  alertFrequencyHours?: number; // 1, 2, 4, 6, 12, 24
  alertStartHour?: number; // 0-23, in alertTimezone
  alertEndHour?: number; // 0-23, in alertTimezone (exclusive)
  alertTimezone?: string; // IANA TZ, e.g. "Asia/Kolkata"

  // Internal state — written by the cron, NOT user-editable.
  lastAlertSentAt?: string; // ISO timestamp
  lastAlert?: string[] // list of urls from last alert
}

// Defaults applied when a user enables auto-run for the first time.
export const DEFAULT_AUTO_RUN: Required<
  Pick<
    UserPreferences,
    "alertFrequencyHours" | "alertStartHour" | "alertEndHour" | "alertTimezone"
  >
> = {
  alertFrequencyHours: 4,
  alertStartHour: 9,
  alertEndHour: 21,
  alertTimezone: "Asia/Kolkata",
};

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
  subscription: jsonb("subscription")
    .$type<Subscription>()
    .notNull()
    .default(DEFAULT_SUBSCRIPTION),
  // Résumé stored in the DB (not on disk) so it survives serverless deploys.
  resumeText: text("resume_text"),
  resumeProfile: text("resume_profile"),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type DeepDiveSectionKind =
  | "company_brief"
  | "deep_gap_analysis"
  | "cover_letter"
  | "resume_rewrites";

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
