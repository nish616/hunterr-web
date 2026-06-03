import { describe, it, expect } from "vitest";
import { rank } from "./pipeline";
import type { Job, Verdict } from "./types";

/**
 * Tests for rank() — the dashboard sort. Determines the order jobs appear
 * in the strong/good/stretch/skip sections. Bugs here would reorder a
 * candidate's results in confusing ways (e.g. a 10/10 sitting below a 7/10).
 *
 * Sort order:
 *   1. aiVerdict (strong > good > stretch > skip > unscored)
 *   2. aiScore   (higher first)
 *   3. keywordScore (higher first)
 *   4. company (alphabetical, tiebreaker)
 */

function makeJob(overrides: Partial<Job>): Job {
  return {
    source: "greenhouse",
    company: "Acme",
    title: "Senior Engineer",
    location: "Bengaluru",
    url: "https://example.com/job",
    postedAt: "",
    description: "",
    keywordScore: 0,
    matchedSkills: [],
    ...overrides,
  };
}

describe("rank", () => {
  it("orders strong > good > stretch > skip", () => {
    const jobs: Job[] = [
      makeJob({ company: "A", aiVerdict: "skip" }),
      makeJob({ company: "B", aiVerdict: "stretch" }),
      makeJob({ company: "C", aiVerdict: "strong" }),
      makeJob({ company: "D", aiVerdict: "good" }),
    ];
    const out = rank(jobs);
    expect(out.map((j) => j.aiVerdict)).toEqual([
      "strong",
      "good",
      "stretch",
      "skip",
    ]);
  });

  it("places unscored jobs LAST regardless of keyword score", () => {
    const jobs: Job[] = [
      makeJob({ company: "Unscored", keywordScore: 99 }),
      makeJob({ company: "Skip", aiVerdict: "skip" as Verdict }),
    ];
    const out = rank(jobs);
    expect(out[0].company).toBe("Skip");
    expect(out[1].company).toBe("Unscored");
  });

  it("within the same verdict, orders by aiScore descending", () => {
    const jobs: Job[] = [
      makeJob({ company: "A", aiVerdict: "strong", aiScore: 9 }),
      makeJob({ company: "B", aiVerdict: "strong", aiScore: 10 }),
    ];
    const out = rank(jobs);
    expect(out.map((j) => j.company)).toEqual(["B", "A"]);
  });

  it("within the same verdict + score, orders by keywordScore descending", () => {
    const jobs: Job[] = [
      makeJob({
        company: "A",
        aiVerdict: "good",
        aiScore: 7,
        keywordScore: 1,
      }),
      makeJob({
        company: "B",
        aiVerdict: "good",
        aiScore: 7,
        keywordScore: 5,
      }),
    ];
    const out = rank(jobs);
    expect(out.map((j) => j.company)).toEqual(["B", "A"]);
  });

  it("uses company name as final tiebreaker (alphabetical)", () => {
    const jobs: Job[] = [
      makeJob({ company: "Zebra", aiVerdict: "good", aiScore: 7 }),
      makeJob({ company: "Acme", aiVerdict: "good", aiScore: 7 }),
      makeJob({ company: "Beta", aiVerdict: "good", aiScore: 7 }),
    ];
    const out = rank(jobs);
    expect(out.map((j) => j.company)).toEqual(["Acme", "Beta", "Zebra"]);
  });

  it("does not mutate the input array", () => {
    const jobs: Job[] = [
      makeJob({ company: "A", aiVerdict: "skip" }),
      makeJob({ company: "B", aiVerdict: "strong" }),
    ];
    const originalOrder = jobs.map((j) => j.company);
    rank(jobs);
    expect(jobs.map((j) => j.company)).toEqual(originalOrder);
  });

  it("handles an empty input array", () => {
    expect(rank([])).toEqual([]);
  });
});
