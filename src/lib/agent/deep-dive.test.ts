import { describe, it, expect } from "vitest";
import {
  stripMetaCommentary,
  isBlockedHost,
  runSaveFinding,
} from "./deep-dive";

/**
 * Tests for the pure helpers in the deep-dive agent module.
 *
 * These cover the parts most likely to silently regress:
 *  - the sanitizer that strips disclaimer prefaces from saved sections
 *    (otherwise the model's RLHF priors leak into user-facing output)
 *  - the blocked-host check that prevents LinkedIn fetches from wasting
 *    the candidate's fetch budget
 *  - the save_finding dispatcher that enforces section-kind validity and
 *    rejects all-meta bodies
 *
 * Anything that exercises Anthropic's API or the DB belongs in an
 * integration test, not here.
 */

describe("stripMetaCommentary", () => {
  it("returns empty string unchanged", () => {
    expect(stripMetaCommentary("")).toBe("");
  });

  it("leaves plain content untouched", () => {
    const input =
      "Acme is a Series B fintech [JD]. The candidate has 4 years of Node.js [resume].";
    expect(stripMetaCommentary(input)).toBe(input);
  });

  it("drops a leading 'Note:' line", () => {
    const input = [
      "Note: The JD body could not be retrieved.",
      "",
      "# Strong overlaps",
      "- Node.js (TypeScript) [JD] [resume]",
    ].join("\n");
    const out = stripMetaCommentary(input);
    expect(out).not.toContain("Note:");
    expect(out).toContain("Strong overlaps");
    expect(out).toContain("Node.js");
  });

  it("drops a leading 'Disclaimer:' line", () => {
    const input = "Disclaimer: limited info.\n\nReal content here.";
    expect(stripMetaCommentary(input)).toBe("Real content here.");
  });

  it("drops sentences mentioning JavaScript-rendered pages", () => {
    const input =
      "Strong overlap on Node.js [resume]. The JD page was JavaScript-rendered and returned no body text.";
    const out = stripMetaCommentary(input);
    expect(out).toContain("Strong overlap on Node.js");
    expect(out).not.toContain("JavaScript");
  });

  it("drops sentences with 'could not be retrieved'", () => {
    const input =
      "Real claim here. The JD body could not be retrieved from the source.";
    const out = stripMetaCommentary(input);
    expect(out).toContain("Real claim here");
    expect(out).not.toContain("could not be retrieved");
  });

  it("drops sentences with 'the analysis below is based on'", () => {
    const input =
      "The analysis below is based on the role title only. Strong overlap on Postgres [JD] [resume].";
    const out = stripMetaCommentary(input);
    expect(out).not.toContain("analysis below");
    expect(out).toContain("Strong overlap on Postgres");
  });

  it("returns empty string when the entire body is disclaimer text", () => {
    const input = [
      "Note: The JD page was JavaScript-rendered.",
      "",
      "The analysis below is based on limited information.",
    ].join("\n");
    expect(stripMetaCommentary(input).trim()).toBe("");
  });

  it("preserves markdown bullets and bold formatting", () => {
    const input = [
      "**Strong overlaps**",
      "- Node.js [JD] [resume]",
      "- PostgreSQL [JD] [resume]",
    ].join("\n");
    expect(stripMetaCommentary(input)).toBe(input);
  });

  it("handles blockquoted Note prefix (> Note:)", () => {
    const input = "> Note: limited info.\n\nReal content.";
    expect(stripMetaCommentary(input)).toBe("Real content.");
  });
});

describe("isBlockedHost", () => {
  it("blocks linkedin.com", () => {
    expect(isBlockedHost("https://linkedin.com/in/example")).toBe(true);
  });

  it("blocks www.linkedin.com", () => {
    expect(isBlockedHost("https://www.linkedin.com/in/example")).toBe(true);
  });

  it("blocks linkedin subdomains", () => {
    expect(isBlockedHost("https://in.linkedin.com/in/example")).toBe(true);
  });

  it("does not block github.com", () => {
    expect(isBlockedHost("https://github.com/example")).toBe(false);
  });

  it("does not block arbitrary portfolio domains", () => {
    expect(isBlockedHost("https://nishins.dev")).toBe(false);
  });

  it("returns false for malformed URLs rather than throwing", () => {
    expect(isBlockedHost("not a url")).toBe(false);
    expect(isBlockedHost("")).toBe(false);
  });

  it("does not match 'linkedin' as a substring in unrelated domains", () => {
    // e.g. a domain containing 'linkedin' but not actually linkedin.com.
    expect(isBlockedHost("https://fakelinkedin-clone.example.com")).toBe(false);
  });
});

describe("runSaveFinding", () => {
  it("rejects an unknown section kind", () => {
    const out = runSaveFinding({
      kind: "wrong_kind",
      content: "Hello world.",
    });
    expect(out.ok).toBe(false);
    expect(out.preview).toBe("bad kind");
  });

  it("rejects an empty content body", () => {
    const out = runSaveFinding({
      kind: "company_brief",
      content: "   ",
    });
    expect(out.ok).toBe(false);
    expect(out.preview).toBe("empty");
  });

  it("saves a valid section and returns the cleaned content", () => {
    const out = runSaveFinding({
      kind: "company_brief",
      content: "Acme is a Series B fintech [JD]. They hire backend engineers.",
    });
    expect(out.ok).toBe(true);
    expect(out.section?.kind).toBe("company_brief");
    expect(out.section?.content).toContain("Acme is a Series B fintech");
  });

  it("rejects a section that is entirely meta-commentary", () => {
    const out = runSaveFinding({
      kind: "deep_gap_analysis",
      content:
        "Note: The JD page was JavaScript-rendered and returned no body text. The analysis below is based on limited information.",
    });
    expect(out.ok).toBe(false);
    expect(out.preview).toBe("all meta");
    expect(out.content).toMatch(/meta-commentary/i);
  });

  it("saves cleaned content and flags as (cleaned) when >30% was stripped", () => {
    // ~200 chars of real content + a long disclaimer at the top.
    const disclaimer =
      "Note: The JD page was JavaScript-rendered and returned no body text. The analysis below is based on the role title only and the candidate's resume, since the page could not be retrieved.\n\n";
    const real =
      "**Strong overlaps**\n- Node.js with TypeScript [resume] aligns with the JD's stated stack.";
    const out = runSaveFinding({
      kind: "deep_gap_analysis",
      content: disclaimer + real,
    });
    expect(out.ok).toBe(true);
    expect(out.preview).toMatch(/cleaned/);
    expect(out.section?.content).not.toContain("Note:");
    expect(out.section?.content).toContain("Strong overlaps");
  });

  it("saves quietly (no '(cleaned)' suffix) when sanitizing barely changes content", () => {
    const out = runSaveFinding({
      kind: "cover_letter",
      content:
        "Dear hiring team, I'm excited to apply for the Senior Engineer role. " +
        "My experience at KT Telematic on real-time GPS pipelines aligns with your stated infrastructure goals. " +
        "I would love to bring this experience to your team and contribute to your platform's growth.",
    });
    expect(out.ok).toBe(true);
    expect(out.preview).toBe("cover_letter");
    expect(out.preview).not.toContain("cleaned");
  });
});
