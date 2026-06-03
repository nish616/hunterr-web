"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ATS_CONFIG } from "@/lib/hunt/config";
import type { UserPreferences } from "@/lib/db/schema";
import type {
  HuntProgress,
  Job,
  RunResult,
  Source,
  Verdict,
} from "@/lib/hunt/types";
import { LAST_RUN_KEY, CACHE_TTL_MS } from "@/lib/run-cache";
import { DeepDivePanel } from "./jobs/deep-dive-panel";

type ProgressState = {
  stageIndex: number; // 0 fetch, 1 filter, 2 triage, 3 score
  companies: number;
  fetched: number | null;
  matched: number | null;
  triagePool: number | null;
  triageSelected: number | null;
  scoreDone: number | null;
  scoreTotal: number | null;
};

function parseList(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Relative "posted" label from an ISO date string. Returns "" for missing or
 * unparseable dates (some Ashby boards omit the field) so we render nothing.
 */
function formatPosted(postedAt: string): string {
  if (!postedAt) return "";
  const ts = Date.parse(postedAt);
  if (Number.isNaN(ts)) return "";

  const diffMs = Date.now() - ts;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days <= 0) return "posted today";
  if (days === 1) return "posted yesterday";
  if (days < 7) return `posted ${days} days ago`;
  if (days < 14) return "posted last week";
  const weeks = Math.floor(days / 7);
  return `posted ${weeks} weeks ago`;
}

type Status = "idle" | "running" | "done" | "error";

function formatAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const ALL_SOURCES: Source[] = ["greenhouse", "lever", "ashby"];

const SOURCE_LABEL: Record<Source, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
};

// Companies configured per ATS — static, derived from config.
const COMPANY_COUNTS: Record<Source, number> = {
  greenhouse: ATS_CONFIG.greenhouse.length,
  lever: ATS_CONFIG.lever.length,
  ashby: ATS_CONFIG.ashby.length,
};
const TOTAL_COMPANIES =
  COMPANY_COUNTS.greenhouse + COMPANY_COUNTS.lever + COMPANY_COUNTS.ashby;

const VERDICT_LABEL: Record<Verdict, string> = {
  strong: "⭐ Strong matches",
  stretch: "🟡 Stretch",
  skip: "⚫ Skip",
};

const VERDICT_PILL: Record<Verdict, string> = {
  strong: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  stretch: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  skip: "bg-muted-foreground/10 text-muted-foreground border-border",
};

export function DashboardClient({
  initialPreferences,
}: {
  initialPreferences: UserPreferences;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [selectedSources, setSelectedSources] = useState<Set<Source>>(
    () => new Set(ALL_SOURCES),
  );

  // Filters are edited on the Profile page; the dashboard just consumes them.
  const preferredTitles = parseList(initialPreferences.preferredTitles);
  const excludedTitles = parseList(initialPreferences.excludedTitles);
  const skills = parseList(initialPreferences.skills);
  const maxAgeDays = initialPreferences.maxAgeDays;

  // Titles and skills are required before a search can run.
  const needsConfig = preferredTitles.length === 0 || skills.length === 0;

  // Restore the last run from localStorage on mount (until a new run replaces it
  // or the cache expires). Keeps results visible across refresh / navigation.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAST_RUN_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as { result: RunResult; fetchedAt: number };
      if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
        window.localStorage.removeItem(LAST_RUN_KEY);
        return;
      }
      setResult(cached.result);
      setFetchedAt(cached.fetchedAt);
      setStatus("done");
    } catch {
      /* corrupt or unavailable cache — ignore */
    }
  }, []);

  function applyProgress(ev: HuntProgress) {
    setProgress((p) => {
      const base: ProgressState = p ?? {
        stageIndex: 0,
        companies: 0,
        fetched: null,
        matched: null,
        triagePool: null,
        triageSelected: null,
        scoreDone: null,
        scoreTotal: null,
      };
      switch (ev.type) {
        case "fetching":
          return { ...base, stageIndex: 0, companies: ev.companies };
        case "fetched":
          return { ...base, fetched: ev.count };
        case "filtering":
          return { ...base, stageIndex: 1 };
        case "filtered":
          return { ...base, matched: ev.count };
        case "triaging":
          return { ...base, stageIndex: 2, triagePool: ev.pool };
        case "triaged":
          return { ...base, triageSelected: ev.selected };
        case "scoring":
          return {
            ...base,
            stageIndex: 3,
            scoreDone: ev.done,
            scoreTotal: ev.total,
          };
        default:
          return base;
      }
    });
  }

  async function runHunt() {
    setStatus("running");
    setError(null);
    setProgress(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            roles: preferredTitles,
            excludeTitles: excludedTitles,
            skills,
            maxAgeDays,
          },
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Hunt failed (${res.status})`);
      }

      // Read the NDJSON stream line by line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: RunResult | null = null;

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const ev = JSON.parse(line) as HuntProgress;
        if (ev.type === "result") finalResult = ev.result;
        else if (ev.type === "error") throw new Error(ev.message);
        else applyProgress(ev);
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep the trailing partial line
        for (const line of lines) handleLine(line);
      }
      if (buffer.trim()) handleLine(buffer); // flush last line

      if (!finalResult) throw new Error("Stream ended without a result.");

      const now = Date.now();
      setResult(finalResult);
      setFetchedAt(now);
      setStatus("done");
      setProgress(null);
      try {
        window.localStorage.setItem(
          LAST_RUN_KEY,
          JSON.stringify({ result: finalResult, fetchedAt: now }),
        );
      } catch {
        /* quota exceeded or storage disabled — non-fatal */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
      setProgress(null);
    }
  }

  function toggleSource(src: Source) {
    if (selectedSources.has(src)) {
      selectedSources.delete(src);
    } else {
      selectedSources.add(src);
    }
    setSelectedSources(new Set(selectedSources));
  }

  // Count jobs per source in the current run.
  const sourceCounts = useMemo(() => {
    const counts: Record<Source, number> = { greenhouse: 0, lever: 0, ashby: 0 };
    result?.jobs.forEach((j) => {
      counts[j.source]++;
    });
    return counts;
  }, [result]);

  const filteredJobs = useMemo(
    () => (result?.jobs ?? []).filter((j) => selectedSources.has(j.source)),
    [result, selectedSources],
  );

  const grouped = groupByVerdict(filteredJobs);

  const [diveJob, setDiveJob] = useState<Job | null>(null);

  return (
    <section className="container mx-auto px-6 py-10 max-w-5xl">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold mb-1">Dashboard</h2>
          <p className="text-muted-foreground">
            {status === "idle" && "Click below to run a fresh hunt."}
            {status === "running" && "Hunt in progress…"}
            {status === "done" && result && (
              <>
                {filteredJobs.length === result.jobs.length
                  ? `${result.jobs.length} matches across ${countCompanies(result.jobs)} companies`
                  : `${filteredJobs.length} of ${result.jobs.length} matches shown`}{" "}
                ·{" "}
                <span className="text-muted-foreground">
                  {result.stats.totalFetched.toLocaleString()} fetched →{" "}
                  {result.stats.totalMatched} matched →{" "}
                  {result.stats.totalScored} scored in{" "}
                  {(result.stats.durationMs / 1000).toFixed(1)}s
                </span>
                {fetchedAt && (
                  <span className="text-muted-foreground">
                    {" "}
                    · fetched {formatAgo(fetchedAt)}
                  </span>
                )}
              </>
            )}
            {status === "error" && (
              <span className="text-destructive">Error: {error}</span>
            )}
          </p>
        </div>
        <Button
          size="lg"
          onClick={runHunt}
          disabled={status === "running" || needsConfig}
        >
          {status === "running" ? "Running hunt…" : "Run new hunt"}
        </Button>
      </div>

      {needsConfig && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm">
          <span className="font-medium text-amber-400">
            ⚠ Configuration required.
          </span>{" "}
          <span className="text-muted-foreground">
            Set your preferred titles and skills before running a search.
          </span>{" "}
          <Link
            href="/dashboard/profile"
            className="font-medium underline underline-offset-4 hover:text-foreground"
          >
            Go to Profile →
          </Link>
        </div>
      )}

      <FilterSummary
        preferredTitles={preferredTitles}
        excludedTitles={excludedTitles}
        skills={skills}
        maxAgeDays={maxAgeDays}
      />

      <SourceFilter
        selected={selectedSources}
        onToggle={toggleSource}
        runCounts={status === "done" ? sourceCounts : null}
      />

      {status === "idle" && (
        <div className="rounded-xl border bg-muted/20 p-12 text-center text-muted-foreground">
          No results yet. Hit <strong>Run new hunt</strong> to fetch fresh jobs.
        </div>
      )}

      {status === "running" && <HuntProgressView progress={progress} />}

      {status === "done" && result && (
        <Link
          href="/dashboard/jobs"
          className="mb-6 flex items-center justify-between gap-4 flex-wrap rounded-xl border bg-muted/10 px-5 py-3 text-sm hover:bg-muted/20 transition-colors"
        >
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">
              View all {result.stats.totalMatched} matched jobs
            </span>{" "}
            in one place
            {result.stats.totalMatched - result.stats.totalScored > 0
              ? `, including the ${
                  result.stats.totalMatched - result.stats.totalScored
                } that weren't AI-scored`
              : ""}
            .
          </span>
          <span className="font-medium whitespace-nowrap">Open Jobs &rarr;</span>
        </Link>
      )}

      {status === "done" && result && filteredJobs.length === 0 && (
        <div className="rounded-xl border bg-muted/20 p-12 text-center text-muted-foreground">
          No jobs match the current source filter. Re-enable a source above to
          see results.
        </div>
      )}

      {status === "done" && result && filteredJobs.length > 0 && (
        <div className="space-y-10">
          {(["strong", "stretch", "skip"] as Verdict[]).map((verdict) =>
            grouped[verdict].length > 0 ? (
              <VerdictSection
                key={verdict}
                title={VERDICT_LABEL[verdict]}
                pillClass={VERDICT_PILL[verdict]}
                jobs={grouped[verdict]}
                defaultOpen={verdict !== "skip"}
                onDeepDive={setDiveJob}
              />
            ) : null,
          )}
          {grouped.unscored.length > 0 && (
            <VerdictSection
              title="Matched, not scored"
              note="These passed your filters but were not in the AI-scored shortlist. Review them to spot anything the ranking missed."
              pillClass={VERDICT_PILL.skip}
              jobs={grouped.unscored}
              defaultOpen={false}
              onDeepDive={setDiveJob}
            />
          )}
        </div>
      )}

      <DeepDivePanel job={diveJob} onClose={() => setDiveJob(null)} />
    </section>
  );
}

function VerdictSection({
  title,
  note,
  pillClass,
  jobs,
  defaultOpen,
  onDeepDive,
}: {
  title: string;
  note?: string;
  pillClass: string;
  jobs: Job[];
  defaultOpen: boolean;
  onDeepDive: (job: Job) => void;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="cursor-pointer text-xl font-semibold mb-1 list-none flex items-center gap-3">
        <span className="text-muted-foreground transition-transform group-open:rotate-90">
          ▸
        </span>
        {title}
        <span className="text-sm font-normal text-muted-foreground">
          ({jobs.length})
        </span>
      </summary>
      {note && (
        <p className="text-sm text-muted-foreground mb-4 ml-7">{note}</p>
      )}
      <div className="grid gap-4 mt-4">
        {jobs.map((j, i) => (
          <JobCard
            key={`${j.company}-${j.url}-${i}`}
            job={j}
            pillClass={pillClass}
            onDeepDive={() => onDeepDive(j)}
          />
        ))}
      </div>
    </details>
  );
}

function JobCard({
  job,
  pillClass,
  onDeepDive,
}: {
  job: Job;
  pillClass: string;
  onDeepDive: () => void;
}) {
  // content-visibility:auto lets the browser skip layout/paint for offscreen
  // cards. contain-intrinsic-size reserves space so the scrollbar doesn't jump
  // as cards enter/leave the viewport (220px ≈ typical card height with AI
  // strengths/gaps; matched-not-scored cards are shorter but the diff is small
  // enough that the scrollbar settle is imperceptible).
  return (
    <Card className="[content-visibility:auto] [contain-intrinsic-size:auto_220px]">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base mb-1">{job.title}</CardTitle>
            <CardDescription>
              <span className="font-medium">{job.company}</span>
              {job.location ? ` · ${job.location}` : ""}
              {formatPosted(job.postedAt) ? ` · ${formatPosted(job.postedAt)}` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {job.aiVerdict ? (
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${pillClass}`}
              >
                {job.aiScore}/10 · {job.aiVerdict}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onDeepDive}
              title="Runs an AI agent that researches the company, drafts a tailored cover letter, and suggests resume rewrites for this role. ~30–90s."
              className="text-sm font-medium px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-muted"
            >
              Deep dive
            </button>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              Apply
            </a>
          </div>
        </div>
      </CardHeader>
      {(job.aiSummary ||
        (job.aiStrengths?.length ?? 0) > 0 ||
        job.matchedSkills.length > 0) && (
        <CardContent className="space-y-3 text-sm">
          {job.aiSummary && (
            <p className="text-muted-foreground italic">{job.aiSummary}</p>
          )}
          {job.aiStrengths && job.aiStrengths.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                Strengths
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {job.aiStrengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {job.aiGaps && job.aiGaps.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                Gaps
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                {job.aiGaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {job.matchedSkills.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Keyword match: {job.matchedSkills.join(", ")}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

const SEARCH_WINDOW_LABEL: Record<number, string> = {
  1: "last 24h",
  3: "last 3 days",
  7: "last week",
};

function FilterSummary({
  preferredTitles,
  excludedTitles,
  skills,
  maxAgeDays,
}: {
  preferredTitles: string[];
  excludedTitles: string[];
  skills: string[];
  maxAgeDays: number | undefined;
}) {
  const parts: string[] = [];
  parts.push(
    preferredTitles.length > 0
      ? `${preferredTitles.length} preferred title${preferredTitles.length > 1 ? "s" : ""}`
      : "no titles set",
  );
  if (excludedTitles.length > 0) {
    parts.push(`${excludedTitles.length} excluded`);
  }
  parts.push(
    skills.length > 0
      ? `${skills.length} skill${skills.length > 1 ? "s" : ""}`
      : "no skills set",
  );
  // maxAgeDays undefined → default (3 days); otherwise show the chosen window.
  const ageKey = maxAgeDays ?? 3;
  parts.push(SEARCH_WINDOW_LABEL[ageKey] ?? `last ${ageKey} days`);

  return (
    <div className="mb-6 rounded-xl border bg-muted/10 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="text-sm">
        <span className="text-muted-foreground">Active filters: </span>
        <span className="font-medium">{parts.join(" · ")}</span>
        {excludedTitles.length > 0 && (
          <span className="text-muted-foreground">
            {" "}
            (excluding: {excludedTitles.join(", ")})
          </span>
        )}
      </div>
      <Link
        href="/dashboard/profile"
        className="text-sm font-medium underline underline-offset-4 hover:text-foreground text-muted-foreground whitespace-nowrap"
      >
        Edit in Profile →
      </Link>
    </div>
  );
}

function SourceFilter({
  selected,
  onToggle,
  runCounts,
}: {
  selected: Set<Source>;
  onToggle: (s: Source) => void;
  runCounts: Record<Source, number> | null;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide font-semibold">
        Sources
        <span className="font-normal normal-case tracking-normal">
          · {TOTAL_COMPANIES} companies across 3 ATSes
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ALL_SOURCES.map((src) => {
          const active = selected.has(src);
          const company = COMPANY_COUNTS[src];
          const jobs = runCounts?.[src] || 0;
          return (
            <button
              key={src}
              type="button"
              onClick={() => onToggle(src)}
              aria-pressed={active}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm border transition-colors flex items-center gap-2",
                active
                  ? "border-foreground/40 bg-foreground/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/70",
              )}
            >
              <span className="font-medium">{SOURCE_LABEL[src]}</span>
              <span className="text-xs text-muted-foreground">
                {company} cos
                {jobs !== undefined && jobs >= 0 ? ` · ${jobs} jobs` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HuntProgressView({ progress }: { progress: ProgressState | null }) {
  const idx = progress?.stageIndex ?? 0;

  const rows: { label: string; detail: string | null }[] = [
    {
      label: `Fetching jobs from ${progress?.companies ?? "…"} companies`,
      detail:
        progress?.fetched != null
          ? `${progress.fetched.toLocaleString()} postings fetched`
          : null,
    },
    {
      label: "Filtering to your titles, skills & location",
      detail: progress?.matched != null ? `${progress.matched} jobs matched` : null,
    },
    {
      label: "Ranking the best matches (Haiku)",
      detail:
        progress?.triageSelected != null
          ? `top ${progress.triageSelected}${
              progress.triagePool ? ` of ${progress.triagePool}` : ""
            } selected`
          : progress?.triagePool != null
            ? `ranking ${progress.triagePool}…`
            : null,
    },
    {
      label: "Scoring shortlist against your résumé (Sonnet)",
      detail:
        progress?.scoreTotal != null
          ? `${progress.scoreDone ?? 0} / ${progress.scoreTotal} scored`
          : null,
    },
  ];

  return (
    <div className="rounded-xl border bg-muted/20 py-16 px-6 flex flex-col items-center">
      <div className="w-full max-w-sm space-y-5">
        {rows.map((row, i) => {
          const state: "done" | "active" | "pending" =
            i < idx ? "done" : i === idx ? "active" : "pending";
          return (
            <div key={i} className="flex items-start gap-3">
              <StageIcon state={state} />
              <div
                className={cn(
                  "flex-1 leading-tight",
                  state === "pending" && "opacity-40",
                )}
              >
                <div className={cn("text-sm", state === "active" && "font-medium")}>
                  {row.label}
                </div>
                {row.detail && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {row.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-10 text-xs text-muted-foreground">
        This usually takes 30–90 seconds.
      </p>
    </div>
  );
}

function StageIcon({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
    );
  }
  return (
    <span className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-muted-foreground/20" />
  );
}

function countCompanies(jobs: Job[]): number {
  return new Set(jobs.map((j) => j.company)).size;
}

function groupByVerdict(jobs: Job[]): {
  strong: Job[];
  stretch: Job[];
  skip: Job[];
  unscored: Job[];
} {
  const groups = { strong: [] as Job[], stretch: [] as Job[], skip: [] as Job[], unscored: [] as Job[] };
  for (const j of jobs) {
    if (j.aiVerdict === "strong") groups.strong.push(j);
    else if (j.aiVerdict === "stretch") groups.stretch.push(j);
    else if (j.aiVerdict === "skip") groups.skip.push(j);
    else groups.unscored.push(j);
  }
  return groups;
}
