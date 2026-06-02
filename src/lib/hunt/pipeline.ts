import { fetchAll } from "./fetchers";
import { filterAndRank } from "./filter";
import { scoreJobs, triageJobs } from "./scoring";
import { AI_MAX_JOBS_PER_RUN, AI_SCORE_LIMIT, ATS_CONFIG } from "./config";
import type {
  FilterOverrides,
  Job,
  ProgressCallback,
  RunResult,
} from "./types";

const TOTAL_COMPANIES =
  ATS_CONFIG.greenhouse.length +
  ATS_CONFIG.lever.length +
  ATS_CONFIG.ashby.length;

const VERDICT_RANK = { strong: 3, stretch: 2, skip: 1 } as const;

function rank(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    const ar = a.aiVerdict ? VERDICT_RANK[a.aiVerdict] : 0;
    const br = b.aiVerdict ? VERDICT_RANK[b.aiVerdict] : 0;
    if (br !== ar) return br - ar;
    const as = a.aiScore ?? 0;
    const bs = b.aiScore ?? 0;
    if (bs !== as) return bs - as;
    if (b.keywordScore !== a.keywordScore) return b.keywordScore - a.keywordScore;
    return a.company.localeCompare(b.company);
  });
}

export async function runHunt(options: {
  userId: string;
  withAi?: boolean;
  filters?: FilterOverrides;
  onProgress?: ProgressCallback;
}): Promise<RunResult> {
  const t0 = Date.now();
  const withAi = options.withAi ?? true;
  const onProgress = options.onProgress;

  onProgress?.({ type: "fetching", companies: TOTAL_COMPANIES });
  const { jobs: fetched, failures } = await fetchAll();
  onProgress?.({ type: "fetched", count: fetched.length });

  onProgress?.({ type: "filtering" });
  const matched = filterAndRank(fetched, options?.filters);
  onProgress?.({ type: "filtered", count: matched.length });

  // Triage pool: the top-N most keyword-relevant matched jobs.
  const pool = matched.slice(0, AI_MAX_JOBS_PER_RUN);

  let scoredJobs: Job[] = [];
  let totalScored = 0;
  if (withAi && pool.length > 0) {
    // Cheap Haiku triage picks the best AI_SCORE_LIMIT for full scoring.
    const toScore = await triageJobs(
      pool,
      options.userId,
      AI_SCORE_LIMIT,
      onProgress,
    );
    scoredJobs = await scoreJobs(toScore, options.userId, onProgress);
    totalScored = scoredJobs.filter((j) => j.aiScore !== undefined).length;
  }

  // Return EVERY matched job, not just the scored ones, so the dashboard can
  // show what was filtered down (transparency / audit). The scored subset gets
  // its AI fields merged back in by job key. Descriptions are stripped to keep
  // the payload (and the client-side cache) lean.
  const scoredByKey = new Map(scoredJobs.map((j) => [jobKey(j), j]));
  const allMatched = matched.map((j) => {
    const merged = scoredByKey.get(jobKey(j)) ?? j;
    return { ...merged, description: "" };
  });

  return {
    jobs: rank(allMatched),
    stats: {
      totalFetched: fetched.length,
      totalMatched: matched.length,
      totalScored,
      failures,
      durationMs: Date.now() - t0,
    },
  };
}

function jobKey(j: Job): string {
  return j.url || `${j.company}::${j.title}`;
}
