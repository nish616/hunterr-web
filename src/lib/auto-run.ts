import { Job } from "@/types/job";

export function getCurrentHourInTz(tz: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  // "24" is what some locales return for midnight — normalize to 0.
  const n = parseInt(h, 10);
  return n === 24 ? 0 : n;
}

export function isWithinWindow(
  hour: number,
  startHour: number,
  endHour: number,
): boolean {
  if (startHour === endHour) return false; // zero-width window
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

export function hasIntervalElapsed(
  lastAlertAt: string | undefined,
  frequencyHours: number,
  now: Date = new Date(),
): boolean {
  if (!lastAlertAt) return true;
  const last = Date.parse(lastAlertAt);
  if (Number.isNaN(last)) return true;
  const elapsedMs = now.getTime() - last;
  if (elapsedMs < 0) return true;
  return elapsedMs >= frequencyHours * 60 * 60 * 1000;
}

export function isAlertDue(
  prefs: {
    alertStartHour: number;
    alertEndHour: number;
    alertTimezone: string;
    alertFrequencyHours: number;
    lastAlertSentAt?: string;
  },
  now: Date = new Date(),
): boolean {
  const hour = getCurrentHourInTz(prefs.alertTimezone, now);
  if (!isWithinWindow(hour, prefs.alertStartHour, prefs.alertEndHour))
    return false;
  return hasIntervalElapsed(prefs.lastAlertSentAt, prefs.alertFrequencyHours, now);
}

export function diffNewJobs(
  current: readonly Job[],
  seenUrls: readonly string[],
): Job[] {
  if (seenUrls.length === 0) return [...current];
  const seen = new Set(seenUrls);
  return current.filter((u) => !seen.has(u.url));
}
