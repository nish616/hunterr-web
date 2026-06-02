#!/usr/bin/env tsx
/**
 * Company discovery — mine new ATS company slugs that have India-located jobs,
 * validate them against the live ATS API, and append the good ones to
 * src/lib/hunt/discovered.json (which config.ts merges into ATS_CONFIG).
 *
 * Two modes:
 *
 *   SEARCH (needs Google Custom Search API keys — see below):
 *     npm run discover -- lever bengaluru
 *     npm run discover -- greenhouse "hyderabad"
 *     npm run discover -- lever "remote india"
 *
 *   MANUAL (no keys — validate + add slugs you found yourself):
 *     npm run discover -- lever --add Sprinto meesho fampay
 *
 *   Flags:
 *     --dry        Preview only; don't write discovered.json
 *
 * Google Custom Search setup (one-time, free 100 queries/day):
 *   1. Create an API key:  https://console.cloud.google.com/apis/credentials
 *      (enable "Custom Search API")
 *   2. Create a search engine: https://programmablesearchengine.google.com/
 *      → set it to "Search the entire web", copy the Search engine ID (cx).
 *   3. Add to .env.local:
 *        GOOGLE_API_KEY=...
 *        GOOGLE_CSE_ID=...
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISCOVERED_PATH = path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "hunt",
  "discovered.json",
);

type Source = "greenhouse" | "lever" | "ashby";
const ATS_HOST: Record<Source, string> = {
  greenhouse: "boards.greenhouse.io",
  lever: "jobs.lever.co",
  ashby: "jobs.ashbyhq.com",
};
const ATS_API: Record<Source, (slug: string) => string> = {
  greenhouse: (s) =>
    `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`,
  lever: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
  ashby: (s) =>
    `https://api.ashbyhq.com/posting-api/job-board/${s}?includeCompensation=false`,
};

const INDIA = [
  "bangalore", "bengaluru", "hyderabad", "india", "pune",
  "gurgaon", "gurugram", "noida", "chennai", "mumbai", "delhi",
];

// Aggregator / reposter slugs to never add (they flood with non-employer noise).
const BLOCKLIST = new Set(["jobgether"]);

// Some locations have common spelling variants worth searching together.
const LOCATION_SYNONYMS: Record<string, string[]> = {
  bengaluru: ["Bengaluru", "Bangalore"],
  bangalore: ["Bengaluru", "Bangalore"],
  hyderabad: ["Hyderabad"],
  "remote india": ["Remote - India", "Remote, India", "Remote (India)"],
};

// ---------- slug extraction from result URLs ----------

function slugFromUrl(url: string, ats: Source): string | null {
  try {
    const u = new URL(url);
    // greenhouse appears on both boards.greenhouse.io and job-boards.greenhouse.io
    if (ats === "greenhouse" && !/greenhouse\.io$/.test(u.hostname)) return null;
    if (ats === "lever" && u.hostname !== "jobs.lever.co") return null;
    if (ats === "ashby" && u.hostname !== "jobs.ashbyhq.com") return null;
    const seg = u.pathname.split("/").filter(Boolean)[0];
    if (!seg) return null;
    return decodeURIComponent(seg);
  } catch {
    return null;
  }
}

// ---------- Google Custom Search ----------

async function googleSearch(query: string): Promise<string[]> {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) {
    throw new Error("NO_KEYS");
  }
  const urls: string[] = [];
  // Two pages = up to 20 results per query.
  for (const start of [1, 11]) {
    const api = new URL("https://www.googleapis.com/customsearch/v1");
    api.searchParams.set("key", key);
    api.searchParams.set("cx", cx);
    api.searchParams.set("q", query);
    api.searchParams.set("start", String(start));
    const res = await fetch(api);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google CSE ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { items?: { link: string }[] };
    for (const it of data.items ?? []) urls.push(it.link);
    if (!data.items || data.items.length < 10) break; // no more pages
  }
  return urls;
}

// ---------- validation ----------

function locOf(j: Record<string, unknown>, ats: Source): string {
  if (ats === "greenhouse")
    return ((j.location as { name?: string })?.name as string) ?? "";
  if (ats === "lever")
    return ((j.categories as { location?: string })?.location as string) ?? "";
  return (j.locationName as string) ?? (j.location as string) ?? "";
}
function listOf(d: unknown, ats: Source): Record<string, unknown>[] {
  if (ats === "lever") return Array.isArray(d) ? (d as []) : [];
  const o = d as { jobs?: []; postings?: [] };
  return (o.jobs ?? o.postings ?? []) as Record<string, unknown>[];
}

async function validate(
  ats: Source,
  slug: string,
): Promise<{ ok: boolean; total: number; india: number }> {
  try {
    const res = await fetch(ATS_API[ats](slug));
    if (!res.ok) return { ok: false, total: 0, india: 0 };
    const data = await res.json();
    const jobs = listOf(data, ats);
    const india = jobs.filter((j) =>
      INDIA.some((k) => locOf(j, ats).toLowerCase().includes(k)),
    ).length;
    return { ok: true, total: jobs.length, india };
  } catch {
    return { ok: false, total: 0, india: 0 };
  }
}

// ---------- main ----------

async function loadDiscovered(): Promise<Record<Source, string[]>> {
  try {
    const raw = await fs.readFile(DISCOVERED_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      greenhouse: parsed.greenhouse ?? [],
      lever: parsed.lever ?? [],
      ashby: parsed.ashby ?? [],
    };
  } catch {
    return { greenhouse: [], lever: [], ashby: [] };
  }
}

// Existing slugs (base config + already-discovered) so we don't re-add. Read
// the base config source as text to avoid importing the whole app graph.
async function loadExisting(): Promise<Set<string>> {
  const cfg = await fs.readFile(
    path.join(__dirname, "..", "src", "lib", "hunt", "config.ts"),
    "utf-8",
  );
  const base = cfg.slice(0, cfg.indexOf("function mergeSlugs"));
  const slugs = new Set<string>();
  for (const m of base.matchAll(/"([^"]+)"/g)) slugs.add(m[1].toLowerCase());
  const disc = await loadDiscovered();
  for (const arr of Object.values(disc))
    for (const s of arr) slugs.add(s.toLowerCase());
  return slugs;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const rest = args.filter((a) => a !== "--dry");

  const ats = rest[0] as Source;
  if (!ats || !ATS_HOST[ats]) {
    console.error(
      "Usage:\n" +
        "  npm run discover -- <greenhouse|lever|ashby> <location...>\n" +
        "  npm run discover -- lever bengaluru\n" +
        "  npm run discover -- lever --add Sprinto meesho   (manual, no API key)\n" +
        "  add --dry to preview without saving",
    );
    process.exit(1);
  }

  const existing = await loadExisting();
  let candidates: string[] = [];

  const addIdx = rest.indexOf("--add");
  if (addIdx !== -1) {
    // Manual mode: validate the slugs the user supplies.
    candidates = rest.slice(addIdx + 1);
    console.log(`Manual mode: validating ${candidates.length} slug(s)…`);
  } else {
    // Search mode: build queries from location terms.
    const term = rest.slice(1).join(" ").trim().toLowerCase();
    if (!term) {
      console.error("Provide a location, e.g. `npm run discover -- lever bengaluru`");
      process.exit(1);
    }
    const variants = LOCATION_SYNONYMS[term] ?? [rest.slice(1).join(" ")];
    const queries = variants.map((v) => `site:${ATS_HOST[ats]} "${v}"`);
    console.log(`Searching ${queries.length} query(ies):`);
    queries.forEach((q) => console.log(`  ${q}`));

    const found = new Set<string>();
    try {
      for (const q of queries) {
        const urls = await googleSearch(q);
        for (const url of urls) {
          const slug = slugFromUrl(url, ats);
          if (slug) found.add(slug);
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message === "NO_KEYS") {
        console.error(
          "\n⚠ Google Custom Search not configured.\n" +
            "Either add GOOGLE_API_KEY + GOOGLE_CSE_ID to .env.local (see script header),\n" +
            "or use manual mode:  npm run discover -- " +
            ats +
            " --add <slug1> <slug2> ...\n",
        );
        process.exit(1);
      }
      throw e;
    }
    candidates = [...found];
    console.log(`\nFound ${candidates.length} unique slug(s) in results.`);
  }

  // Dedup vs existing + blocklist.
  const fresh = candidates.filter(
    (s) => !existing.has(s.toLowerCase()) && !BLOCKLIST.has(s.toLowerCase()),
  );
  const skippedKnown = candidates.length - fresh.length;
  if (skippedKnown > 0)
    console.log(`(${skippedKnown} already in config or blocklisted — skipped)`);

  if (fresh.length === 0) {
    console.log("\nNothing new to validate.");
    return;
  }

  console.log(`\nValidating ${fresh.length} new slug(s) against the live API…\n`);
  const results = await Promise.all(
    fresh.map(async (slug) => ({ slug, ...(await validate(ats, slug)) })),
  );
  const good = results.filter((r) => r.ok && r.india > 0).sort((a, b) => b.india - a.india);
  const noIndia = results.filter((r) => r.ok && r.india === 0);
  const dead = results.filter((r) => !r.ok);

  console.log("=== HAS INDIA JOBS (added) ===");
  if (good.length === 0) console.log("  (none)");
  for (const r of good)
    console.log(`  ${r.slug.padEnd(24)} ${r.india} india / ${r.total} total`);
  if (noIndia.length)
    console.log(
      `\n0 India jobs now (skipped): ${noIndia.map((r) => r.slug).join(", ")}`,
    );
  if (dead.length)
    console.log(`dead / 404 (skipped): ${dead.map((r) => r.slug).join(", ")}`);

  if (good.length === 0) return;

  if (dry) {
    console.log("\n--dry: not saving. Re-run without --dry to persist.");
    return;
  }

  const disc = await loadDiscovered();
  disc[ats] = [...new Set([...disc[ats], ...good.map((r) => r.slug)])];
  await fs.writeFile(DISCOVERED_PATH, JSON.stringify(disc, null, 2) + "\n");
  console.log(
    `\n✓ Added ${good.length} to discovered.json under "${ats}". ` +
      `Restart the dev server to pick them up.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
