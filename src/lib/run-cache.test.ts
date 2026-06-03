import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadCachedRun,
  LAST_RUN_KEY,
  CACHE_TTL_MS,
  type CachedRun,
} from "./run-cache";
import type { RunResult } from "./hunt/types";

/**
 * Tests for the client-side localStorage cache. loadCachedRun() is
 * called from the Jobs page to populate the cached job list without
 * re-running the hunt. The TTL behavior matters — stale results should
 * be silently expired so the user re-runs.
 *
 * We mock window.localStorage rather than pulling in jsdom for this
 * one small surface. Vitest's node environment doesn't have `window`,
 * so we create a minimal global.
 */

const STORAGE = new Map<string, string>();

beforeEach(() => {
  STORAGE.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => STORAGE.get(k) ?? null,
      setItem: (k: string, v: string) => STORAGE.set(k, v),
      removeItem: (k: string) => STORAGE.delete(k),
      clear: () => STORAGE.clear(),
    },
  });
});

const emptyResult: RunResult = {
  jobs: [],
  stats: {
    totalFetched: 0,
    totalMatched: 0,
    totalScored: 0,
    failures: [],
    durationMs: 0,
  },
};

describe("loadCachedRun", () => {
  it("returns null when no cache entry exists", () => {
    expect(loadCachedRun()).toBeNull();
  });

  it("returns the cached entry when it's fresh", () => {
    const cached: CachedRun = { result: emptyResult, fetchedAt: Date.now() };
    STORAGE.set(LAST_RUN_KEY, JSON.stringify(cached));
    const out = loadCachedRun();
    expect(out).not.toBeNull();
    expect(out?.result).toEqual(emptyResult);
  });

  it("returns null and clears the entry when it's older than the TTL", () => {
    const stale: CachedRun = {
      result: emptyResult,
      fetchedAt: Date.now() - CACHE_TTL_MS - 1,
    };
    STORAGE.set(LAST_RUN_KEY, JSON.stringify(stale));
    expect(loadCachedRun()).toBeNull();
    // Stale entry should have been evicted as a side effect.
    expect(STORAGE.has(LAST_RUN_KEY)).toBe(false);
  });

  it("returns null on malformed JSON without throwing", () => {
    STORAGE.set(LAST_RUN_KEY, "not valid json {{{");
    expect(() => loadCachedRun()).not.toThrow();
    expect(loadCachedRun()).toBeNull();
  });

  it("keeps the entry when it's exactly at the TTL boundary (inclusive)", () => {
    // fetchedAt = now - TTL → age === TTL → NOT > TTL → kept.
    const cached: CachedRun = {
      result: emptyResult,
      fetchedAt: Date.now() - CACHE_TTL_MS,
    };
    STORAGE.set(LAST_RUN_KEY, JSON.stringify(cached));
    expect(loadCachedRun()).not.toBeNull();
  });
});
