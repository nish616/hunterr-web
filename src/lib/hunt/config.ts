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
    // Schrödinger Inc.'s actual Greenhouse slug — looks like a typo but it's
    // not. "schrodinger" 404s; "schrdinger" returns jobs. Don't "fix" it.
    "schrdinger",
    "degreed",
    "earnin",
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
    // Sprinto's Lever slug is case-sensitive - lowercase "sprinto" 404s.
    // Don't lowercase this even if it looks inconsistent with the others.
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
    "almabase",
    "office-hours",
    // Flagright's Ashby slug includes the .com suffix - without it 404s.
    // Don't strip the .com.
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

export const LOCATION_KEYWORDS = ["bengaluru", "bangalore", "hyderabad", "india"];

export const ALLOW_REMOTE = true;

export const MIN_SKILL_MATCHES = 1;

export const MAX_AGE_DAYS = 3;

export const ALLOWED_REMOTE_REGIONS = [
  "india"
];

export const AI_MAX_JOBS_PER_RUN = 80; // max jobs 
export const AI_SCORE_LIMIT = 30; // selects for full scoring
export const AI_MAX_CONCURRENCY = 4; // parallel Sonnet scoring calls
export const AI_MODEL = "claude-sonnet-4-6"; // fit-scoring model
export const AI_TRIAGE_MODEL = "claude-haiku-4-5"; // relevance-ranking model
