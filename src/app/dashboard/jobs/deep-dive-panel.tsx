"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  SECTION_LABELS,
  SECTION_ORDER,
  type DeepDiveEvent,
} from "@/lib/agent/types";
import type { DeepDiveSectionKind, DeepDiveSections } from "@/lib/db/schema";
import type { Job } from "@/lib/hunt/types";

type ActivityLine = { iter: number; text: string };

interface DeepDivePanelProps {
  job: Job | null;
  onClose: () => void;
}

export function DeepDivePanel({ job, onClose }: DeepDivePanelProps) {
  const [sections, setSections] = useState<DeepDiveSections>({});
  const [activity, setActivity] = useState<ActivityLine[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "running" | "complete" | "failed">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setSections({});
    setActivity([]);
    setErrorMsg(null);
  }, []);

  // Load any previously persisted dive when the panel opens for this job.
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    reset();
    setStatus("loading");
    (async () => {
      try {
        const res = await fetch(
          `/api/jobs/deep-dive?jobUrl=${encodeURIComponent(job.url)}`,
        );
        if (!res.ok) {
          setStatus("idle");
          return;
        }
        const data = (await res.json()) as {
          dive: null | {
            status: "running" | "complete" | "failed";
            sections: DeepDiveSections;
            error: string | null;
          };
        };
        if (cancelled) return;
        if (data.dive) {
          setSections(data.dive.sections ?? {});
          if (data.dive.error) setErrorMsg(data.dive.error);
          setStatus(data.dive.status === "running" ? "idle" : data.dive.status);
        } else {
          setStatus("idle");
        }
      } catch {
        if (!cancelled) setStatus("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job, reset]);

  // Abort any in-flight stream when the panel closes.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startRun = useCallback(async () => {
    if (!job) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    reset();
    setStatus("running");

    let iter = 0;
    try {
      const res = await fetch("/api/jobs/deep-dive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: DeepDiveEvent;
          try {
            event = JSON.parse(line) as DeepDiveEvent;
          } catch {
            continue;
          }
          handleEvent(event);
        }
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStatus("failed");
    }

    function handleEvent(event: DeepDiveEvent) {
      switch (event.type) {
        case "iteration":
          iter = event.n;
          push(iter, `thinking… (turn ${iter})`);
          break;
        case "tool_use":
          push(iter, `→ ${event.name}(${describeInput(event.input)})`);
          break;
        case "tool_result":
          push(iter, `  ${event.ok ? "✓" : "✗"} ${event.preview}`);
          break;
        case "section_saved":
          setSections((s) => ({
            ...s,
            [event.kind]: { content: event.content, savedAt: Date.now() },
          }));
          push(iter, `★ saved ${SECTION_LABELS[event.kind]}`);
          break;
        case "done":
          push(iter, `done — ${event.sectionsSaved} section(s)`);
          setStatus("complete");
          break;
        case "error":
          push(iter, `error: ${event.message}`);
          setErrorMsg(event.message);
          setStatus("failed");
          break;
      }
    }

    function push(n: number, text: string) {
      setActivity((a) => [...a, { iter: n, text }]);
    }
  }, [job, reset]);

  function describeInput(input: Record<string, unknown>): string {
    if (typeof input.query === "string") return `"${truncate(input.query, 50)}"`;
    if (typeof input.url === "string") return truncate(input.url, 50);
    if (typeof input.kind === "string") return input.kind;
    return "";
  }

  if (!job) return null;

  const hasSections = Object.keys(sections).length > 0;
  const isBusy = status === "running" || status === "loading";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed inset-y-0 right-0 w-full max-w-2xl bg-background border-l border-border z-50 flex flex-col">
        <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Deep dive
            </div>
            <h3 className="font-semibold truncate">{job.title}</h3>
            <p className="text-sm text-muted-foreground truncate">
              {job.company} · {job.location || "—"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={startRun}
              disabled={isBusy}
            >
              {status === "running"
                ? "Running…"
                : hasSections
                  ? "Regenerate"
                  : "Run deep dive"}
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {errorMsg && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300 px-3 py-2">
              {errorMsg}
            </div>
          )}

          {!hasSections && status === "idle" && (
            <div className="text-sm text-muted-foreground">
              Click <span className="font-medium text-foreground">Run deep dive</span> to research this company, write a tailored cover letter, and suggest resume rewrites. ~30-90s, ~$0.25 in API spend.
            </div>
          )}

          {SECTION_ORDER.filter((k) => sections[k]).map((kind) => (
            <SectionBlock key={kind} kind={kind} content={sections[kind]!.content} />
          ))}

          {isBusy && activity.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Agent activity
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs space-y-0.5 max-h-64 overflow-y-auto">
                {activity.map((l, i) => (
                  <div key={i} className={cn(l.text.startsWith("  ") && "text-muted-foreground")}>
                    {l.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function SectionBlock({
  kind,
  content,
}: {
  kind: DeepDiveSectionKind;
  content: string;
}) {
  return (
    <section>
      <h4 className="font-medium text-sm uppercase tracking-wide text-muted-foreground mb-2">
        {SECTION_LABELS[kind]}
      </h4>
      <div className="text-sm leading-relaxed whitespace-pre-wrap">{content}</div>
    </section>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
