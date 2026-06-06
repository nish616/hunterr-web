/**
 * Hunt configuration — direct port of hunterr/config.yaml.
 * Edit freely; changes take effect on the next run.
 */
import discovered from "./discovered.json";

const BASE_ATS_CONFIG = {
  greenhouse: [
    // Indian-HQ
    "phonepe",
    "groww",
    "postman",
    "druva",
    "highradius",
    // US/global with active India eng hiring
    "airbnb",
    "amplitude",
    "asana",
    "cloudflare",
    "cockroachlabs",
    "coursera",
    "databricks",
    "datadog",
    "dropbox",
    "elastic",
    "figma",
    "flexport",
    "gitlab",
    "instacart",
    "mixpanel",
    "mongodb",
    "newrelic",
    "okta",
    "pinterest",
    "reddit",
    "samsara",
    "snowflake",
    "stripe",
    "sumologic",
    "twilio",
    "vercel",
    "verkada",
    "zscaler",
    "coupang",
    "hackerrank",
    "6sense",
    "bitgo",
    "vonage",
    "stockx",
    "gomotive",
    "ibkr",
    "singlestore",
    "schrdinger",
    "degreed",
  ],
  lever: [
    "cred",
    "spotify",
    "matchgroup",
    "safe",
    "jumpcloud",
    "vendavo",
    "revefi",
    "thinkahead",
    "zeta",
    "cyara",
    "dnb",
    "coupa",
    "shyftlabs",
    "egen",
    "turvo",
    "elfbeauty",
    "moonpay",
    "Sprinto",
    "meesho",
    "mindtickle",
    "fampay",
    "netomi",
    "hevodata",
    "smart-working-solutions",
    "binance",
  ],
  ashby: [
    "linear",
    "vanta",
    "ramp",
    "posthog",
    "browserbase",
    "modal",
    "notion",
    "openai",
    "harvey",
    "Almabase",
    "office-hours",
    "flagright.com",
    "ontologize",
    "astronomer",
    "atlan",
    "gainsight",
  ],
};

type Source = "greenhouse" | "lever" | "ashby";
function mergeSlugs(src: Source): string[] {
  const base = BASE_ATS_CONFIG[src] ?? [];
  const extra = (discovered as Record<string, string[]>)[src] ?? [];
  return [...new Set([...base, ...extra])];
}

export const ATS_CONFIG: Record<Source, string[]> = {
  greenhouse: mergeSlugs("greenhouse"),
  lever: mergeSlugs("lever"),
  ashby: mergeSlugs("ashby"),
};

export const ROLE_KEYWORDS = [
  "full stack",
  "full-stack",
  "fullstack",
  "backend",
  "back-end",
  "back end",
  "software engineer",
  "software developer",
  "developer",
];

export const SKILL_KEYWORDS = [
  "typescript",
  "javascript",
  "python",
  "react",
  "next.js",
  "nextjs",
  "node",
  "node.js",
  "nodejs",
  "tailwind",
  "aws",
];

export const LOCATION_KEYWORDS = ["bengaluru", "bangalore", "hyderabad"];

export const ALLOW_REMOTE = true;

export const MIN_SKILL_MATCHES = 1;

export const MAX_AGE_DAYS = 3;

// Substrings that, when present alongside "remote", mean the role is geofenced
// to a region that isn't India.
export const BLOCKED_REMOTE_REGIONS = [
  // Country names
  "united states",
  "usa",
  "canada",
  "mexico",
  "united kingdom",
  "germany",
  "poland",
  "ireland",
  "netherlands",
  "argentina",
  "brazil",
  "remote - us",
  "remote-us",
  "remote, us",
  "us-remote",
  "remote u.s.",
  "us;",
  " us:",
  "; us",
  ", us",
  "remote - uk",
  "remote-uk",
  "remote, uk",
  "uk-remote",
  ", uk",
  " uk:",
  "; uk",
  // Region terms
  "emea",
  "americas",
  "north america",
  "latam",
  // US states / Canadian provinces
  "california",
  "colorado",
  "illinois",
  "new york",
  "washington",
  "massachusetts",
  "texas",
  "ontario",
  "alberta",
  "british columbia",
  "san francisco",
  "sf bay area",
  "bay area",
  "los angeles",
  "new york city",
  "nyc",
  "boston",
  "chicago",
  "seattle",
  "austin",
  "denver",
  "atlanta",
  "london",
  "manchester",
  "edinburgh",
];

export const AI_MAX_JOBS_PER_RUN = 80; // max jobs 
export const AI_SCORE_LIMIT = 30; // selects for full scoring
export const AI_MAX_CONCURRENCY = 4; // parallel Sonnet scoring calls
export const AI_MODEL = "claude-sonnet-4-6"; // fit-scoring model
export const AI_TRIAGE_MODEL = "claude-haiku-4-5"; // relevance-ranking model
