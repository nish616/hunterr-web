import { describe, it, expect } from "vitest";
import {
  isPro,
  upgradeRequestMailto,
  UPGRADE_REQUEST_EMAIL,
} from "./subscription";

describe("isPro", () => {
  it("returns true for the pro tier", () => {
    expect(isPro("pro")).toBe(true);
  });

  it("returns false for the free tier", () => {
    expect(isPro("free")).toBe(false);
  });
});

describe("upgradeRequestMailto", () => {
  it("addresses the upgrade-handler email", () => {
    const href = upgradeRequestMailto("user@example.com");
    expect(href.startsWith(`mailto:${UPGRADE_REQUEST_EMAIL}?`)).toBe(true);
  });

  it("includes the user's email in the subject", () => {
    const href = upgradeRequestMailto("user@example.com");
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain("user@example.com");
    expect(decoded.toLowerCase()).toContain("upgrade");
  });

  it("includes the user's email in the body", () => {
    const href = upgradeRequestMailto("user@example.com");
    const decoded = decodeURIComponent(href);
    // Body should mention the account explicitly so the upgrade can be
    // processed without a back-and-forth.
    expect(decoded).toMatch(/Account:.*user@example\.com/);
  });

  it("URL-encodes whitespace and special characters", () => {
    const href = upgradeRequestMailto("user+tag@example.com");
    // Raw spaces and '+' must not appear unencoded in the query string.
    // (`%20` for space, `%2B` for '+' inside the encoded chunk.)
    expect(href.split("?")[1]).not.toMatch(/ /);
    // Email with + should be preserved exactly when decoded.
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain("user+tag@example.com");
  });
});
