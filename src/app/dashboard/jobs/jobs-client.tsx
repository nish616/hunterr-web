"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { loadCachedRun, type CachedRun } from "@/lib/run-cache";
import type { Job, Verdict } from "@/lib/hunt/types";
import { DeepDivePanel } from "./deep-dive-panel";

type StatusFilter = "all" | "scored" | "unscored" | Verdict;

const VERDICT_PILL: Record<Verdict, string> = {
  strong: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  good: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  stretch: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  skip: "bg-muted-foreground/10 text-muted-foreground border-border",
};

function formatAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function postedLabel(postedAt: string): string {
  if (!postedAt) return "—";
  const ts = Date.parse(postedAt);
  if (Number.isNaN(ts)) return "—";
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export function JobsClient() {
  const [run, setRun] = useState<CachedRun | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [diveJob, setDiveJob] = useState<Job | null>(null);

  useEffect(() => {
    setRun(loadCachedRun());
    setLoaded(true);
  }, []);

  const jobs = run?.result.jobs ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter === "scored" && !j.aiVerdict) return false;
      if (filter === "unscored" && j.aiVerdict) return false;
      if (
        (filter === "strong" ||
          filter === "good" ||
          filter === "stretch" ||
          filter === "skip") &&
        j.aiVerdict !== filter
      )
        return false;
      if (q) {
        const hay = `${j.title} ${j.company} ${j.location}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, search, filter]);

  const counts = useMemo(() => {
    const c = { all: jobs.length, scored: 0, unscored: 0 };
    for (const j of jobs) {
      if (j.aiVerdict) c.scored++;
      else c.unscored++;
    }
    return c;
  }, [jobs]);

  if (!loaded) {
    return (
      <section className="container mx-auto px-6 py-10 max-w-6xl text-muted-foreground">
        Loading…
      </section>
    );
  }

  if (!run || jobs.length === 0) {
    return (
      <section className="container mx-auto px-6 py-10 max-w-6xl">
        <h2 className="text-3xl font-bold mb-2">All jobs</h2>
        <div className="rounded-xl border bg-muted/20 p-12 text-center text-muted-foreground">
          No run yet. Go to the{" "}
          <Link href="/dashboard" className="underline hover:text-foreground">
            Dashboard
          </Link>{" "}
          and run a hunt — every matched job will show up here.
        </div>
      </section>
    );
  }

  const stats = run.result.stats;

  return (
    <section className="container mx-auto px-6 py-10 max-w-6xl">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-1">All jobs</h2>
        <p className="text-sm text-muted-foreground">
          {stats.totalFetched.toLocaleString()} fetched ·{" "}
          {stats.totalMatched} matched · {stats.totalScored} scored · fetched{" "}
          {formatAgo(run.fetchedAt)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Every job that passed your filters. The unscored ones did not make the
          AI shortlist — scan them to catch anything the ranking missed.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input
          placeholder="Search title, company, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", `All (${counts.all})`],
              ["scored", `Scored (${counts.scored})`],
              ["unscored", `Not scored (${counts.unscored})`],
            ] as [StatusFilter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm border transition-colors",
                filter === key
                  ? "border-foreground/40 bg-foreground/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium hidden md:table-cell">
                Location
              </th>
              <th className="px-4 py-2 font-medium hidden sm:table-cell">
                Posted
              </th>
              <th className="px-4 py-2 font-medium hidden lg:table-cell">
                Skills
              </th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((j, i) => (
              <JobRow
                key={`${j.company}-${j.url}-${i}`}
                job={j}
                onDeepDive={() => setDiveJob(j)}
              />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No jobs match this filter.
          </div>
        )}
      </div>

      <DeepDivePanel job={diveJob} onClose={() => setDiveJob(null)} />
    </section>
  );
}

function JobRow({ job, onDeepDive }: { job: Job; onDeepDive: () => void }) {
  return (
    <tr className="border-t border-border hover:bg-muted/20">
      <td className="px-4 py-3 align-top whitespace-nowrap">
        {job.aiVerdict ? (
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full border",
              VERDICT_PILL[job.aiVerdict],
            )}
          >
            {job.aiScore}/10 {job.aiVerdict}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">not scored</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="font-medium">{job.title}</div>
        <div className="text-xs text-muted-foreground">{job.company}</div>
        {job.aiSummary && (
          <div className="text-xs text-muted-foreground italic mt-1 max-w-xl">
            {job.aiSummary}
          </div>
        )}
      </td>
      <td className="px-4 py-3 align-top text-muted-foreground hidden md:table-cell">
        {job.location || "—"}
      </td>
      <td className="px-4 py-3 align-top text-muted-foreground hidden sm:table-cell whitespace-nowrap">
        {postedLabel(job.postedAt)}
      </td>
      <td className="px-4 py-3 align-top text-xs text-muted-foreground hidden lg:table-cell max-w-[14rem]">
        {job.matchedSkills.join(", ") || "—"}
      </td>
      <td className="px-4 py-3 align-top text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onDeepDive}
            title="Runs an AI agent that researches the company, drafts a tailored cover letter, and suggests resume rewrites for this role. ~30–90s."
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Deep dive
          </button>
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium underline underline-offset-4 hover:text-foreground"
          >
            Apply
          </a>
        </div>
      </td>
    </tr>
  );
}
