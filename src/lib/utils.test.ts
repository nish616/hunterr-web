import { describe, it, expect } from "vitest";
import { cn } from "./utils";

/**
 * Tests for the cn() class-name helper. It's used everywhere in the UI
 * to compose Tailwind classes with conditional logic; a regression here
 * would silently break visual styling.
 */
describe("cn", () => {
  it("joins string class names with a space", () => {
    expect(cn("p-4", "rounded")).toBe("p-4 rounded");
  });

  it("ignores falsy inputs", () => {
    expect(cn("p-4", false, null, undefined, "")).toBe("p-4");
  });

  it("merges conflicting tailwind classes, keeping the last one", () => {
    // The whole point of using tailwind-merge — last wins for same utility.
    expect(cn("p-4", "p-8")).toBe("p-8");
    expect(cn("text-red-500", "text-emerald-400")).toBe("text-emerald-400");
  });

  it("flattens arrays and objects per clsx conventions", () => {
    expect(cn(["p-4", "rounded"])).toBe("p-4 rounded");
    expect(cn({ "p-4": true, "rounded": false })).toBe("p-4");
  });

  it("returns an empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});
