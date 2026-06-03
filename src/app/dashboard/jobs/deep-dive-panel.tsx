"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  SECTION_LABELS,
  SECTION_ORDER,
  type DeepDiveEvent,
  type ToolName,
} from "@/lib/agent/types";
import type { DeepDiveSectionKind, DeepDiveSections } from "@/lib/db/schema";
import type { Job } from "@/lib/hunt/types";

type ActivityLine = { ok: boolean | null; text: string };

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
  // Buffer sections while the run is in flight; only commit when done.
  const pendingRef = useRef<DeepDiveSections>({});

  const reset = useCallback(() => {
    setSections({});
    setActivity([]);
    setErrorMsg(null);
    pendingRef.current = {};
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

    // Pair each tool_use with its tool_result into a single activity line.
    // We stash the most recent tool_use and, when its result arrives,
    // replace the in-progress line with a final past-tense one.
    let pendingTool: {
      name: ToolName;
      input: Record<string, unknown>;
    } | null = null;

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
        case "tool_result":
          // iteration is too chatty; tool_result is folded into tool_use below.
          if (event.type === "tool_result" && pendingTool) {
            // Snapshot before queueing — see TDZ / closure note above.
            const tool = pendingTool;
            const ok = event.ok;
            setActivity((a) => {
              const next = a.slice(0, -1);
              next.push({ ok, text: describeAction(tool, ok) });
              return next;
            });
            pendingTool = null;
          }
          break;
        case "tool_use":
          pendingTool = { name: event.name, input: event.input };
          push(null, describeAction(pendingTool, null));
          break;
        case "section_saved":
          pendingRef.current = {
            ...pendingRef.current,
            [event.kind]: { content: event.content, savedAt: Date.now() },
          };
          break;
        case "done":
          setSections(pendingRef.current);
          setStatus("complete");
          break;
        case "error":
          push(false, event.message);
          setErrorMsg(event.message);
          setStatus("failed");
          break;
      }
    }

    function push(ok: boolean | null, text: string) {
      setActivity((a) => [...a, { ok, text }]);
    }
  }, [job, reset]);

  /**
   * Render a single activity line as plain English. The user doesn't care
   * about tool names, character counts, or HTTP status codes — they want
   * to know what the agent is doing right now and what it just finished.
   *
   * - ok === null  →  in-progress ("Reading …", "Writing …")
   * - ok === true  →  past tense  ("Read", "Wrote")
   * - ok === false →  failure     ("Couldn't read …")
   */
  function describeAction(
    tool: { name: ToolName; input: Record<string, unknown> },
    ok: boolean | null,
  ): string {
    if (tool.name === "fetch_url") {
      const url = typeof tool.input.url === "string" ? tool.input.url : "";
      const target = jobUrlLabel(url);
      if (ok === null) return `Reading ${target}…`;
      if (ok) return `Read ${target}`;
      return `Couldn't reach ${target}`;
    }
    if (tool.name === "save_finding") {
      const kind = tool.input.kind as DeepDiveSectionKind | undefined;
      const label = kind
        ? SECTION_LABELS[kind].toLowerCase()
        : "a section";
      if (ok === null) return `Writing ${label}…`;
      if (ok) return `Wrote ${label}`;
      return `Couldn't write ${label}`;
    }
    return tool.name;
  }

  /**
   * "boards.greenhouse.io" if we can parse the URL, "the job posting" if
   * it matches the job URL, and a truncated string as a last resort.
   */
  function jobUrlLabel(url: string): string {
    if (job && url === job.url) return "the job posting";
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return truncate(url, 30);
    }
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

          {status === "running" && (
            <div className="rounded-md border border-border bg-muted/20 p-3 text-xs font-mono space-y-1">
              {activity.length === 0 ? (
                <div className="text-muted-foreground">starting…</div>
              ) : (
                activity.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.ok === false
                        ? "text-red-400"
                        : l.ok === null
                          ? "text-muted-foreground"
                          : "text-foreground"
                    }
                  >
                    {l.text}
                  </div>
                ))
              )}
            </div>
          )}

          {status !== "running" &&
            SECTION_ORDER.filter((k) => sections[k]).map((kind) => (
              <SectionBlock
                key={kind}
                kind={kind}
                content={sections[kind]!.content}
              />
            ))}
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
      <div className="text-sm leading-relaxed space-y-2">
        <Markdown source={content} />
      </div>
    </section>
  );
}

/**
 * Minimal markdown renderer for the agent's section output.
 * Handles: # / ## headings, **bold**, *italic*, `code`, [text](url),
 * bullet lists (- or *), and paragraph breaks. No tables, no nested lists.
 * Anything fancier and the agent isn't producing it anyway.
 */
function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line -> skip
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const className =
        level === 1
          ? "text-base font-semibold mt-1"
          : level === 2
            ? "text-sm font-semibold mt-1"
            : "text-sm font-medium mt-1";
      blocks.push(
        <div key={key++} className={className}>
          <Inline text={text} />
        </div>,
      );
      i++;
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-5 space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>
              <Inline text={item} />
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Paragraph: collect consecutive non-blank, non-special lines
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++}>
        <Inline text={para.join(" ")} />
      </p>,
    );
  }

  return <>{blocks}</>;
}

/**
 * Inline formatting: **bold**, *italic*, `code`, [text](url), [bare citation].
 * Tokenized in one pass so nested patterns work in the common case.
 */
function Inline({ text }: { text: string }) {
  // Order matters: links first (greedy), then code, then bold, then italic.
  const pattern =
    /(\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    }
    if (m[1]) {
      // [text](url)
      out.push(
        <a
          key={key++}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground text-muted-foreground"
        >
          {m[2]}
        </a>,
      );
    } else if (m[4]) {
      // `code`
      out.push(
        <code
          key={key++}
          className="rounded bg-muted px-1 py-0.5 text-xs font-mono"
        >
          {m[5]}
        </code>,
      );
    } else if (m[6]) {
      // **bold**
      out.push(
        <strong key={key++} className="font-semibold">
          {m[7]}
        </strong>,
      );
    } else if (m[8]) {
      // *italic*
      out.push(
        <em key={key++} className="italic">
          {m[9]}
        </em>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  }
  return <>{out}</>;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
