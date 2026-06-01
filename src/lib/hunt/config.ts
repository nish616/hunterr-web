/**
 * Hunt configuration — direct port of hunterr/config.yaml.
 * Edit freely; changes take effect on the next run.
 */

// Every slug below was validated against the live ATS API and confirmed to have
// at least one India-located posting at the time of adding. Re-validate
// periodically — boards change and companies migrate ATS providers.
export const ATS_CONFIG = {
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
  ],
  lever: ["cred", "spotify", "matchgroup"],
  ashby: [
    "linear",
    "vanta",
    "ramp",
    "posthog",
    "browserbase",
    "modal",
    "notion",
    "openai",
  ],
} as const;

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
  // "US" appearances
  "remote - us",
  "remote-us",
  "remote, us",
  "us-remote",
  "remote u.s.",
  "us;",
  " us:",
  "; us",
  ", us",
  // Region terms
  "emea",
  "americas",
  // US states / Canadian provinces
  "california",
  "colorado",
  "illinois",
  "new york",
  "washington",
  "ontario",
  "alberta",
  "british columbia",
];

// Ceiling on jobs sent to the AI per run — guards against a runaway config.
export const AI_MAX_JOBS_PER_RUN = 30;
export const AI_MAX_CONCURRENCY = 2;
export const AI_MODEL = "claude-sonnet-4-6";
