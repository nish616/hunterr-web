import type { RunResult } from "./hunt/types";

// The last run is cached in localStorage so results survive refresh/navigation
// and can be read by other pages (e.g. the all-jobs view) without re-running.
export const LAST_RUN_KEY = "hunterr.lastRun.v1";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type CachedRun = { result: RunResult; fetchedAt: number };

export function loadCachedRun(): CachedRun | null {
  try {
    const raw = window.localStorage.getItem(LAST_RUN_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedRun;
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      window.localStorage.removeItem(LAST_RUN_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}
