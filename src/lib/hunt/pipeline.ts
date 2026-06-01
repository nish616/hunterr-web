import { fetchAll } from "./fetchers";
import { filterAndRank } from "./filter";
import { scoreJobs } from "./scoring";
import { AI_MAX_JOBS_PER_RUN } from "./config";
import type { FilterOverrides, Job, RunResult } from "./types";

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

export async function runHunt(options?: {
  withAi?: boolean;
  filters?: FilterOverrides;
}): Promise<RunResult> {
  const t0 = Date.now();
  const withAi = options?.withAi ?? true;

  const { jobs: fetched, failures } = await fetchAll();
  const matched = filterAndRank(fetched, options?.filters);
  const limited = matched.slice(0, AI_MAX_JOBS_PER_RUN);

  let scoredJobs: Job[] = limited;
  let totalScored = 0;
  if (withAi && limited.length > 0) {
    scoredJobs = await scoreJobs(limited);
    totalScored = scoredJobs.filter((j) => j.aiScore !== undefined).length;
  }

  return {
    jobs: rank(scoredJobs),
    stats: {
      totalFetched: fetched.length,
      totalMatched: matched.length,
      totalScored,
      failures,
      durationMs: Date.now() - t0,
    },
  };
}
