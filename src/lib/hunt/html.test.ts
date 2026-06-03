import { describe, it, expect } from "vitest";
import { stripHtml } from "./html";

/**
 * Tests for stripHtml() — the HTML-to-text converter used to prepare JD
 * bodies and fetched pages for the LLM. Bugs here would either leak HTML
 * into the prompt (eating tokens, confusing the model) or strip too
 * aggressively and lose content.
 */
describe("stripHtml", () => {
  it("returns empty string for null / undefined / empty input", () => {
    expect(stripHtml(null)).toBe("");
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml("")).toBe("");
  });

  it("strips simple tags", () => {
    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
    expect(stripHtml("<div><span>One</span> <span>Two</span></div>")).toBe(
      "One Two",
    );
  });

  it("removes <script> blocks including their contents", () => {
    expect(
      stripHtml("Before<script>alert('xss')</script>After"),
    ).toBe("Before After");
  });

  it("removes <style> blocks including their contents", () => {
    expect(
      stripHtml("Before<style>body { color: red; }</style>After"),
    ).toBe("Before After");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(stripHtml("&lt;tag&gt;")).toBe("<tag>");
    expect(stripHtml("foo&nbsp;bar")).toBe("foo bar");
    expect(stripHtml("it&#39;s great")).toBe("it's great");
    expect(stripHtml("it&apos;s also great")).toBe("it's also great");
    expect(stripHtml("&quot;quoted&quot;")).toBe('"quoted"');
  });

  it("collapses runs of whitespace and trims", () => {
    expect(stripHtml("   one   two   three   ")).toBe("one two three");
    expect(stripHtml("line\n\n\nbreaks\t\there")).toBe("line breaks here");
  });

  it("handles tags with attributes", () => {
    expect(
      stripHtml('<a href="https://example.com" target="_blank">link</a>'),
    ).toBe("link");
  });

  it("handles realistic JD-style markup", () => {
    const html = `
      <h2>About the role</h2>
      <p>We're looking for a <strong>Senior Engineer</strong> with experience in Node.js.</p>
      <ul><li>5+ years experience</li><li>TypeScript</li></ul>
      <script>analytics.track('jobview');</script>
    `;
    const out = stripHtml(html);
    expect(out).toContain("About the role");
    expect(out).toContain("Senior Engineer");
    expect(out).toContain("5+ years experience");
    expect(out).not.toContain("analytics");
    expect(out).not.toContain("<");
  });
});
