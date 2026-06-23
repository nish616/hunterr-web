import { describe, it, expect } from "vitest";
import {
  getCurrentHourInTz,
  isWithinWindow,
  hasIntervalElapsed,
  isAlertDue,
  diffNewJobs,
} from "./auto-run";


describe("getCurrentHourInTz", () => {
  it("returns the hour in the given IANA timezone", () => {
    // 2026-06-23T00:00:00Z is 05:30 IST (Asia/Kolkata = UTC+5:30) → hour 5
    const utc = new Date("2026-06-23T00:00:00Z");
    expect(getCurrentHourInTz("Asia/Kolkata", utc)).toBe(5);
  });

  it("handles UTC", () => {
    const utc = new Date("2026-06-23T14:00:00Z");
    expect(getCurrentHourInTz("UTC", utc)).toBe(14);
  });

  it("handles a negative-offset timezone (LA)", () => {
    // 2026-06-23T14:00:00Z is 07:00 PDT (LA, UTC-7) → hour 7
    const utc = new Date("2026-06-23T14:00:00Z");
    expect(getCurrentHourInTz("America/Los_Angeles", utc)).toBe(7);
  });

  it("returns 0 for midnight rather than 24", () => {
    // 2026-06-22T18:30:00Z is 00:00 IST next day → hour 0
    const utc = new Date("2026-06-22T18:30:00Z");
    expect(getCurrentHourInTz("Asia/Kolkata", utc)).toBe(0);
  });
});

describe("isWithinWindow", () => {
  it("includes the start hour, excludes the end hour (9-21)", () => {
    expect(isWithinWindow(9, 9, 21)).toBe(true); // start is inclusive
    expect(isWithinWindow(15, 9, 21)).toBe(true);
    expect(isWithinWindow(20, 9, 21)).toBe(true);
    expect(isWithinWindow(21, 9, 21)).toBe(false); // end is exclusive
    expect(isWithinWindow(8, 9, 21)).toBe(false);
    expect(isWithinWindow(22, 9, 21)).toBe(false);
  });

  it("returns false for a zero-width window", () => {
    expect(isWithinWindow(10, 10, 10)).toBe(false);
  });

  it("handles wrapping windows (22 -> 6)", () => {
    // Late-night window
    expect(isWithinWindow(23, 22, 6)).toBe(true);
    expect(isWithinWindow(2, 22, 6)).toBe(true);
    expect(isWithinWindow(22, 22, 6)).toBe(true);
    expect(isWithinWindow(6, 22, 6)).toBe(false); // end exclusive
    expect(isWithinWindow(10, 22, 6)).toBe(false);
  });
});

describe("hasIntervalElapsed", () => {
  const now = new Date("2026-06-23T12:00:00Z");

  it("returns true when no previous alert exists", () => {
    expect(hasIntervalElapsed(undefined, 4, now)).toBe(true);
  });

  it("returns true when last-alert string is unparseable", () => {
    expect(hasIntervalElapsed("not a date", 4, now)).toBe(true);
  });

  it("returns false when too little time has passed", () => {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    expect(hasIntervalElapsed(oneHourAgo, 4, now)).toBe(false);
  });

  it("returns true when interval has just elapsed", () => {
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
    expect(hasIntervalElapsed(fourHoursAgo, 4, now)).toBe(true);
  });

  it("treats negative elapsed (clock skew) as elapsed", () => {
    // last-alert recorded in the future — should not block forever
    const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    expect(hasIntervalElapsed(future, 4, now)).toBe(true);
  });
});

describe("isAlertDue (composite)", () => {
  // 2026-06-23T08:00:00Z is 13:30 IST → hour 13. Inside a 9-21 IST window.
  const insideWindow = new Date("2026-06-23T08:00:00Z");
  // 2026-06-23T23:00:00Z is 04:30 IST → hour 4. Outside a 9-21 window.
  const outsideWindow = new Date("2026-06-23T23:00:00Z");

  const prefs = {
    alertStartHour: 9,
    alertEndHour: 21,
    alertTimezone: "Asia/Kolkata",
    alertFrequencyHours: 4,
  };

  it("returns false when outside the alert window", () => {
    expect(isAlertDue(prefs, outsideWindow)).toBe(false);
  });

  it("returns true when inside the window and no previous alert", () => {
    expect(isAlertDue(prefs, insideWindow)).toBe(true);
  });

  it("returns false when inside the window but the interval hasn't elapsed", () => {
    const recent = new Date(
      insideWindow.getTime() - 1 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      isAlertDue({ ...prefs, lastAlertSentAt: recent }, insideWindow),
    ).toBe(false);
  });

  it("returns true when inside the window and the interval has elapsed", () => {
    const longAgo = new Date(
      insideWindow.getTime() - 5 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      isAlertDue({ ...prefs, lastAlertSentAt: longAgo }, insideWindow),
    ).toBe(true);
  });
});

describe("diffNewJobs", () => {
  it("returns all current URLs when seen is empty", () => {
    expect(diffNewJobs(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("filters out URLs already in the seen set", () => {
    expect(diffNewJobs(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });

  it("returns an empty array when everything has been seen", () => {
    expect(diffNewJobs(["a", "b"], ["a", "b", "c"])).toEqual([]);
  });

  it("preserves the order of `current`", () => {
    expect(diffNewJobs(["c", "a", "b"], ["a"])).toEqual(["c", "b"]);
  });
});
