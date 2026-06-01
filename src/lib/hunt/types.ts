export type Source = "greenhouse" | "lever" | "ashby";
export type Verdict = "strong" | "stretch" | "skip";

/**
 * User-supplied filter overrides for a single hunt invocation.
 * Empty / undefined fields fall back to the defaults in config.ts.
 */
export interface FilterOverrides {
  /** Replaces ROLE_KEYWORDS — title must contain at least one of these. */
  roles?: string[];
  /** New filter — title must NOT contain any of these (e.g. "java", "staff"). */
  excludeTitles?: string[];
  /** Replaces SKILL_KEYWORDS — used for keyword scoring. */
  skills?: string[];
  /** Max posting age in days; 0 = no limit. Overrides MAX_AGE_DAYS. */
  maxAgeDays?: number;
}

export interface Job {
  source: Source;
  company: string;
  title: string;
  location: string;
  url: string;
  postedAt: string; // ISO date or ""
  description: string;
  // Keyword pre-filter outputs
  keywordScore: number;
  matchedSkills: string[];
  // AI scoring outputs (populated by scoring.ts)
  aiScore?: number;
  aiVerdict?: Verdict;
  aiStrengths?: string[];
  aiGaps?: string[];
  aiSummary?: string;
}

export interface RunStats {
  totalFetched: number;
  totalMatched: number;
  totalScored: number;
  failures: { ats: string; slug: string; error: string }[];
  durationMs: number;
}

export interface RunResult {
  jobs: Job[];
  stats: RunStats;
}
