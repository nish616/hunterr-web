import {
  LOCATION_KEYWORDS,
  ALLOW_REMOTE,
  MIN_SKILL_MATCHES,
  MAX_AGE_DAYS,
  ALLOWED_REMOTE_REGIONS,
} from "./config";
import type { FilterOverrides, Job } from "./types";

function titleMatchesRole(title: string, roleKeywords: string[]): boolean {
  const t = title.toLowerCase();
  return roleKeywords.some((k) => t.includes(k.toLowerCase()));
}

function titleIsExcluded(title: string, excluded: string[]): boolean {
  if (excluded.length === 0) return false;
  const t = title.toLowerCase();
  return excluded.some((k) => t.includes(k.toLowerCase()));
}

function locationMatches(location: string): boolean {
  if (!location) return false;
  const loc = location.toLowerCase();
  if (LOCATION_KEYWORDS.some((k) => loc.includes(k.toLowerCase()))) return true;
  if (ALLOW_REMOTE && /remote|anywhere|worldwide/.test(loc)) {
    if (ALLOWED_REMOTE_REGIONS.some((r) => loc.includes(r))) return true;
    return false;
  }
  return false;
}

function scoreSkills(
  job: Job,
  skills: string[],
): { score: number; matched: string[] } {
  const haystack = `${job.title}\n${job.description}`.toLowerCase();
  const matched: string[] = [];
  for (const s of skills) {
    // Word-boundary-ish regex so "java" doesn't match "javascript",
    // but "node.js" / "next.js" do match.
    const escaped = s.toLowerCase().replace(/[.+#]/g, "\\$&");
    const pattern = new RegExp(`(?<![a-z0-9+#.])${escaped}(?![a-z0-9+#])`, "i");
    if (pattern.test(haystack)) matched.push(s);
  }
  return { score: matched.length, matched };
}

function isWithinAge(postedAt: string, maxAgeDays: number): boolean {
  if (!postedAt || maxAgeDays <= 0) return true;
  const posted = Date.parse(postedAt);
  if (Number.isNaN(posted)) return true; // benefit of the doubt for unparseable dates
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return posted >= cutoff;
}

export function filterAndRank(jobs: Job[], overrides?: FilterOverrides): Job[] {
  const roleKeywords = overrides?.roles ?? [];
  const skillKeywords = overrides?.skills ?? [];
  const excludedTitles = overrides?.excludeTitles ?? [];
  const maxAgeDays = overrides?.maxAgeDays ?? MAX_AGE_DAYS;

  const out: Job[] = [];
  for (const j of jobs) {
    if (!titleMatchesRole(j.title, roleKeywords)) continue;
    if (titleIsExcluded(j.title, excludedTitles)) continue;
    if (!locationMatches(j.location)) continue;
    if (!isWithinAge(j.postedAt, maxAgeDays)) continue;

    const { score, matched } = scoreSkills(j, skillKeywords);
    if (score < MIN_SKILL_MATCHES) continue;

    out.push({ ...j, keywordScore: score, matchedSkills: matched });
  }

  out.sort((a, b) => {
    if (b.keywordScore !== a.keywordScore) return b.keywordScore - a.keywordScore;
    return a.company.localeCompare(b.company);
  });
  return out;
}
