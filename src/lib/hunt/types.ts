export type Source = "greenhouse" | "lever" | "ashby";
// Verdict order is meaningful — "strong" > "good" > "stretch" > "skip".
// "good" is the new median between confident apply and gap-filled stretch.
export type Verdict = "strong" | "good" | "stretch" | "skip";

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

/**
 * Progress events streamed from the hunt pipeline to the client during a run.
 * One JSON object per line (NDJSON).
 */
export type HuntProgress =
  | { type: "fetching"; companies: number }
  | { type: "fetched"; count: number }
  | { type: "filtering" }
  | { type: "filtered"; count: number }
  | { type: "triaging"; pool: number }
  | { type: "triaged"; selected: number }
  | { type: "scoring"; done: number; total: number }
  | { type: "result"; result: RunResult }
  | { type: "error"; message: string };

export type ProgressCallback = (event: HuntProgress) => void;
