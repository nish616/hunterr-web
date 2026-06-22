import { describe, it, expect } from "vitest";
import { filterAndRank } from "./filter";
import type { Job, FilterOverrides } from "./types";

// Fixture factory — builds a Job with sensible defaults you can override.
function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    source: "greenhouse",
    company: "Acme",
    title: "Senior Engineer",
    location: "Bengaluru, India",
    url: "https://example.com/job/1",
    postedAt: new Date().toISOString(),
    description: "We use Node.js and TypeScript.",
    keywordScore: 0,
    matchedSkills: [],
    ...overrides,
  };
}

const baseFilters: FilterOverrides = {
  roles: ["engineer"],
  skills: ["node.js"],
  excludeTitles: [],
  maxAgeDays: 30,
};

describe("filterAndRank — title matching", () => {
  it("keeps jobs whose title contains a role keyword (case-insensitive)", () => {
    const jobs = [
      makeJob({ title: "Senior Engineer" }),
      makeJob({ title: "SENIOR ENGINEER" }),
      makeJob({ title: "Designer" }),
    ];
    const out = filterAndRank(jobs, baseFilters);
    expect(out).toHaveLength(2);
    expect(out.every((j) => /engineer/i.test(j.title))).toBe(true);
  });

  it("drops jobs whose title doesn't contain any role keyword", () => {
    const jobs = [makeJob({ title: "Product Manager" })];
    expect(filterAndRank(jobs, baseFilters)).toHaveLength(0);
  });

  it("drops jobs whose title matches an excludeTitles term", () => {
    const jobs = [
      makeJob({ title: "Senior Engineer" }),
      makeJob({ title: "Senior Java Engineer" }),
    ];
    const out = filterAndRank(jobs, {
      ...baseFilters,
      excludeTitles: ["java"],
    });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Senior Engineer");
  });

  it("drops everything when no roles configured (empty allowlist)", () => {
    const jobs = [makeJob({ title: "Senior Engineer" })];
    expect(filterAndRank(jobs, { ...baseFilters, roles: [] })).toHaveLength(0);
  });
});

describe("filterAndRank — location matching", () => {
  it("keeps jobs in configured India cities", () => {
    const jobs = [
      makeJob({ location: "Bengaluru, India" }),
      makeJob({ location: "Bangalore" }),
      makeJob({ location: "Hyderabad" }),
    ];
    expect(filterAndRank(jobs, baseFilters)).toHaveLength(3);
  });

  it("keeps generic remote roles (when ALLOW_REMOTE is true)", () => {
    const jobs = [
      makeJob({ location: "Remote" }),
      makeJob({ location: "Anywhere" }),
      makeJob({ location: "Worldwide" }),
    ];
    expect(filterAndRank(jobs, baseFilters)).toHaveLength(3);
  });

  it("drops Remote roles geofenced to a blocked region", () => {
    const jobs = [
      makeJob({ location: "Remote - US" }),
      makeJob({ location: "Remote - Canada" }),
      makeJob({ location: "Remote, EMEA" }),
    ];
    expect(filterAndRank(jobs, baseFilters)).toHaveLength(0);
  });

  it("drops UK-geofenced remote roles (abbreviation + city)", () => {
    const jobs = [
      makeJob({ location: "Remote - UK" }),
      makeJob({ location: "Remote, London" }),
      makeJob({ location: "Remote - Manchester" }),
    ];
    expect(filterAndRank(jobs, baseFilters)).toHaveLength(0);
  });

  it("drops US-city-geofenced remote roles", () => {
    const jobs = [
      makeJob({ location: "Remote - SF Bay Area" }),
      makeJob({ location: "Remote, NYC" }),
      makeJob({ location: "Remote - Boston" }),
      makeJob({ location: "Remote, Seattle" }),
    ];
    expect(filterAndRank(jobs, baseFilters)).toHaveLength(0);
  });

  it("drops jobs in non-India, non-remote locations", () => {
    const jobs = [
      makeJob({ location: "San Francisco, CA" }),
      makeJob({ location: "London, UK" }),
    ];
    expect(filterAndRank(jobs, baseFilters)).toHaveLength(0);
  });

  it("drops jobs with empty location", () => {
    expect(filterAndRank([makeJob({ location: "" })], baseFilters)).toHaveLength(
      0,
    );
  });
});

describe("filterAndRank — skill matching", () => {
  it("counts skills found in title or description (case-insensitive)", () => {
    const jobs = [
      makeJob({
        title: "Senior Engineer",
        description: "Node.js and PostgreSQL.",
      }),
    ];
    const out = filterAndRank(jobs, {
      ...baseFilters,
      skills: ["node.js", "postgresql", "rust"],
    });
    expect(out[0].keywordScore).toBe(2);
    expect(out[0].matchedSkills).toEqual(
      expect.arrayContaining(["node.js", "postgresql"]),
    );
    expect(out[0].matchedSkills).not.toContain("rust");
  });

  it("uses word-boundary matching: 'java' does NOT match 'javascript'", () => {
    const jobs = [
      makeJob({
        title: "Senior Engineer",
        description: "We use javascript heavily.",
      }),
    ];
    const out = filterAndRank(jobs, {
      ...baseFilters,
      skills: ["java"],
    });
    expect(out).toHaveLength(0); // no skill matches → below MIN_SKILL_MATCHES
  });

  it("matches dotted skills like 'node.js' and 'next.js'", () => {
    const jobs = [
      makeJob({
        title: "Senior Engineer",
        description: "Built with Next.js and Node.js.",
      }),
    ];
    const out = filterAndRank(jobs, {
      ...baseFilters,
      skills: ["next.js", "node.js"],
    });
    expect(out[0].matchedSkills).toEqual(
      expect.arrayContaining(["next.js", "node.js"]),
    );
  });

  it("drops jobs with zero skill matches", () => {
    const jobs = [
      makeJob({
        title: "Senior Engineer",
        description: "Only mentions Ruby on Rails.",
      }),
    ];
    expect(filterAndRank(jobs, baseFilters)).toHaveLength(0);
  });
});

describe("filterAndRank — posting age", () => {
  it("keeps recent postings", () => {
    const jobs = [
      makeJob({
        postedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(filterAndRank(jobs, { ...baseFilters, maxAgeDays: 7 })).toHaveLength(
      1,
    );
  });

  it("drops postings older than maxAgeDays", () => {
    const jobs = [
      makeJob({
        postedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(filterAndRank(jobs, { ...baseFilters, maxAgeDays: 7 })).toHaveLength(
      0,
    );
  });

  it("gives benefit of the doubt on unparseable / missing postedAt", () => {
    const jobs = [
      makeJob({ postedAt: "" }),
      makeJob({ postedAt: "not a date" }),
    ];
    expect(filterAndRank(jobs, baseFilters)).toHaveLength(2);
  });

  it("disables age check when maxAgeDays <= 0", () => {
    const jobs = [
      makeJob({
        postedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(filterAndRank(jobs, { ...baseFilters, maxAgeDays: 0 })).toHaveLength(
      1,
    );
  });
});

describe("filterAndRank — ranking", () => {
  it("sorts by keywordScore descending, then company ascending", () => {
    const jobs = [
      makeJob({
        company: "Zebra",
        title: "Senior Engineer",
        description: "Node.js",
      }),
      makeJob({
        company: "Acme",
        title: "Senior Engineer",
        description: "Node.js TypeScript Postgres",
      }),
      makeJob({
        company: "Beta",
        title: "Senior Engineer",
        description: "Node.js",
      }),
    ];
    const out = filterAndRank(jobs, {
      ...baseFilters,
      skills: ["node.js", "typescript", "postgres"],
    });
    expect(out.map((j) => j.company)).toEqual(["Acme", "Beta", "Zebra"]);
    expect(out[0].keywordScore).toBeGreaterThan(out[1].keywordScore);
  });

  it("preserves the original job object (no in-place mutation)", () => {
    const job = makeJob();
    const original = { ...job };
    filterAndRank([job], baseFilters);
    expect(job).toEqual(original);
  });
});
