import { ATS_CONFIG } from "./config";
import type { Source } from "./types";

// Pretty display names for slugs that don't title-case cleanly.
const LABELS: Record<string, string> = {
  phonepe: "PhonePe",
  groww: "Groww",
  postman: "Postman",
  druva: "Druva",
  highradius: "HighRadius",
  cockroachlabs: "Cockroach Labs",
  newrelic: "New Relic",
  sumologic: "Sumo Logic",
  openai: "OpenAI",
  matchgroup: "Match Group",
  mongodb: "MongoDB",
  gitlab: "GitLab",
  posthog: "PostHog",
  cred: "CRED",
  okta: "Okta",
  zscaler: "Zscaler",
  browserbase: "Browserbase",
};

// Indian-headquartered companies — tagged so users see local-first options.
const INDIAN_HQ = new Set([
  "phonepe",
  "groww",
  "postman",
  "druva",
  "highradius",
  "cred",
]);

const BOARD_URL: Record<Source, (slug: string) => string> = {
  greenhouse: (s) => `https://boards.greenhouse.io/${s}`,
  lever: (s) => `https://jobs.lever.co/${s}`,
  ashby: (s) => `https://jobs.ashbyhq.com/${s}`,
};

export interface CompanyEntry {
  slug: string;
  label: string;
  ats: Source;
  boardUrl: string;
  indianHq: boolean;
}

function labelFor(slug: string): string {
  return LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** All tracked companies, grouped by ATS, each sorted alphabetically by label. */
export function getCompaniesByAts(): Record<Source, CompanyEntry[]> {
  const out = {} as Record<Source, CompanyEntry[]>;
  for (const [ats, slugs] of Object.entries(ATS_CONFIG) as [
    Source,
    readonly string[],
  ][]) {
    out[ats] = slugs
      .map((slug) => ({
        slug,
        label: labelFor(slug),
        ats,
        boardUrl: BOARD_URL[ats](slug),
        indianHq: INDIAN_HQ.has(slug),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  return out;
}

export const TOTAL_COMPANIES =
  ATS_CONFIG.greenhouse.length +
  ATS_CONFIG.lever.length +
  ATS_CONFIG.ashby.length;

export const ATS_COUNT = Object.keys(ATS_CONFIG).length;
