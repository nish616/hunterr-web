import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { stripHtml } from "@/lib/hunt/html";
import { AI_MODEL } from "@/lib/hunt/config";
import type { Job } from "@/lib/hunt/types";
import type { DeepDiveSectionKind } from "@/lib/db/schema";
import type {
  DeepDiveEvent,
  DeepDiveEventCallback,
  ToolName,
} from "./types";

const MAX_ITERATIONS = 10;
const MAX_FETCHES = 5;
const FETCH_BYTE_LIMIT = 200_000;
const FETCH_CHAR_RETURN = 8_000;

const VALID_SECTIONS: DeepDiveSectionKind[] = [
  "company_brief",
  "deep_gap_analysis",
  "cover_letter",
  "resume_rewrites",
];

const SYSTEM_PROMPT = `You are a job-application research agent. Given one job posting and the candidate's resume, your job is to produce a short, fact-grounded deep-dive report.

Produce up to four sections by calling save_finding once per section:
- company_brief — what the company does, stage/funding, recent news, leadership, red flags. ~150 words.
- deep_gap_analysis — specific overlaps and gaps between this candidate's resume and this JD. Cite exact phrases from both. ~200 words. Use two subsections, **Strong overlaps** and **Gaps**, each rendered as a bullet list (one bullet per item, each bullet 1-2 sentences). Do NOT use markdown tables — the renderer does not support them and the output will be unreadable.
- cover_letter — a tailored cover letter draft (~250 words). Concrete, no platitudes.
- resume_rewrites — 3-6 actionable items, before/after style. Two kinds are allowed:
    (a) REWRITE — pick an existing bullet from the candidate's resume and fold in specific signals from the JD (named tech, scale, hiring buzzphrases). No generic verb-swapping ("designed" → "architected" is useless). Do not invent stack details the candidate didn't use.
    (b) ADD — when the JD calls for a technology the candidate has clear evidence of using (mentioned in their structured profile, raw resume body, or visible on their GitHub) but DIDN'T surface in their main resume, propose adding a bullet for it. In the same item, name the weakest existing bullet the candidate should drop to make room.
  Format each item as: **Before:** "<original bullet, or 'none — new bullet'>" / **After:** "<rewritten or new bullet>" / **Why:** <one sentence: which JD phrase(s) you aligned to. For ADDs, also name which bullet to drop and why it's the weakest.>

Hard rules:
- Every claim in every section must trace to a specific source: the JD, the resume, or a page you fetched. If you cannot point to the source, do not write the claim.
- Do not extrapolate from stage, geography, or industry. "Series B" does not tell you about product-market fit. "SF-based" does not tell you about culture. If the JD says "Series B fintech," you may write "Series B fintech" — nothing more.
- You have no web-search tool. company_brief will be skipped on this run unless you can ground it in a page you fetch_url'd. Do not attempt it from the JD alone.
- Use fetch_url only on URLs you can name directly: the JD URL, and the candidate's GitHub / portfolio links if set.
- Cite sources inline as [domain.com] for every fetched fact, and [JD] or [resume] for facts from those.
- You have at most ${MAX_FETCHES} fetches across the whole run. Spend them deliberately.
- Do not fetch the same URL more than once in a run. Page content does not change between turns of a single dive. If you already fetched a URL, the prior tool_result is still valid — refer back to it instead of issuing a duplicate fetch. The harness will short-circuit duplicates and return the cached body, but it wastes a turn and clutters the activity log.
- Be concise. The candidate is busy. A shorter, fully-grounded section is better than a longer one with one invented sentence.
- Two rules about meta-commentary, both equally hard:

  (1) If you cannot produce a useful section, DO NOT call save_finding for it. Silent skip.

  (2) When you DO save a section, the body must read as confident, final, user-facing output. The candidate sees only the saved sections — they do NOT see your reasoning about your data, your tools, your fetches, or your limitations. Even when you have partial information, write only from what you DO have, with the same voice you would use if the information was complete. Never add prefaces, notes, footnotes, or asides explaining what you couldn't fetch, what was JavaScript-rendered, what sources were unavailable, what you decided not to assert, what the JD didn't say, why the analysis is "based on" certain inputs, or anything else describing your research process.

  Specifically banned — never include any sentence resembling these patterns in saved section bodies, even at the top or as a "Note:":
  * "Note: The JD body could not be retrieved..."
  * "...is JavaScript-rendered and returned only CSS..."
  * "The analysis below is based on..."
  * "Per the hard rules of this report..."
  * "Sources were unavailable..."
  * "Without access to..."
  * "Given the limited information..."
  * Any "Note:" preface to a section body, in any framing.

  If you only have the role title and location to work with for a section like deep_gap_analysis, that's fine — write the analysis using the role title, location, and the candidate's resume, in confident voice. If even that isn't enough to produce something useful, skip the section entirely (rule 1). There is no third option with a disclaimer.
- Formatting: use only markdown headings (#, ##), paragraphs, bullet lists (- ...), **bold**, *italic*, inline code spans, and [text](url) links. Do NOT use markdown tables (pipe-separated rows) — the panel's renderer does not support them and your output will appear as literal pipe characters and dashes. When you want to compare two columns of items, use a bullet list with bolded labels instead (e.g. "- **JD requirement:** ... Resume evidence: ...").
- The cover_letter and resume_rewrites sections must not contain em-dashes (—) anywhere. Em-dashes are a recognizable LLM tell and these sections will be read by recruiters, so they need to feel like a human wrote them. Use periods, commas, parentheses, or semicolons instead. Other sections (company_brief, deep_gap_analysis) may use em-dashes normally.

Efficiency:
- You may emit multiple tool calls in a single turn. Batch fetches that don't depend on each other, and emit several save_finding calls in the same response once you're ready to write.
- A typical run is: turn 1 fetch what you need (in parallel), turn 2 read results and save all grounded sections at once, turn 3 end. Aim for that shape.

When you have saved all the sections you can ground, end your turn (no further tool calls). The harness will close the run.`;

const TOOLS = [
  {
    name: "fetch_url",
    description: "Fetch a URL and return up to ~8000 characters of plain text (HTML stripped). Use on URLs you can name directly: the JD URL, the candidate's GitHub / portfolio links.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "Full URL starting with http(s)://." },
      },
      required: ["url"],
    },
  },
  {
    name: "save_finding",
    description: "Save one section of the deep-dive report. Call once per section, only when grounded in facts.",
    input_schema: {
      type: "object" as const,
      properties: {
        kind: {
          type: "string",
          enum: VALID_SECTIONS,
          description: "Which section this is.",
        },
        content: {
          type: "string",
          description: "Markdown content for the section. Be specific. Cite sources as [domain.com].",
        },
      },
      required: ["kind", "content"],
    },
  },
];

async function resolveApiKey(): Promise<string | undefined> {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const file = await fs.readFile(
      path.join(process.cwd(), ".env.local"),
      "utf-8",
    );
    const match = file.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    return match?.[1].trim();
  } catch {
    return undefined;
  }
}

async function loadResumeContext(userId: string): Promise<string> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { resumeText: true, resumeProfile: true, preferences: true },
  });
  const profile = row?.resumeProfile ?? "";
  const resume = row?.resumeText ?? "";
  if (!profile && !resume) {
    throw new Error("No résumé on file. Upload one on the Résumé page first.");
  }
  const prefs = row?.preferences ?? {};
  const linkLines: string[] = [];
  if (prefs.linkedinUrl) linkLines.push(`LinkedIn: ${prefs.linkedinUrl}`);
  if (prefs.githubUrl) linkLines.push(`GitHub: ${prefs.githubUrl}`);
  if (prefs.portfolioUrl) linkLines.push(`Portfolio: ${prefs.portfolioUrl}`);
  const linksBlock = linkLines.length
    ? `\n\n## Candidate Links\n\n${linkLines.join("\n")}\n\nYou may reference these in the cover letter. You may fetch_url the GitHub and Portfolio URLs to read more about the candidate. DO NOT fetch_url the LinkedIn URL — LinkedIn blocks programmatic requests with 999/403 responses and returns a login wall instead of profile content. Reference the LinkedIn URL only as a fact (e.g. in the cover letter); do not try to fetch its contents.`
    : "";
  return `## Candidate Profile (structured)\n\n${profile}\n\n## Candidate Resume (raw)\n\n${resume}${linksBlock}`;
}

export type ToolOutcome = {
  ok: boolean;
  preview: string;
  content: string;
  section?: { kind: DeepDiveSectionKind; content: string };
};

/**
 * Hosts that aggressively block programmatic requests. LinkedIn is the only
 * one we care about today (999 for unauthenticated user-agents, login-wall
 * redirects otherwise). Add others here as we discover them.
 */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /(?:^|\.)linkedin\.com$/i,
];

export function isBlockedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return BLOCKED_HOST_PATTERNS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

async function runFetchUrl(url: string): Promise<ToolOutcome> {
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, preview: "bad url", content: "URL must start with http:// or https://." };
  }
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0 hunterr-deep-dive" },
    });
    if (!res.ok) {
      return { ok: false, preview: `${res.status}`, content: `Fetch failed: ${res.status} ${res.statusText}` };
    }
    const raw = await res.text();
    const truncated = raw.slice(0, FETCH_BYTE_LIMIT);
    const text = stripHtml(truncated).slice(0, FETCH_CHAR_RETURN);
    return {
      ok: true,
      preview: `${text.length} chars`,
      content: text || "(empty page)",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, preview: "fetch error", content: `Fetch error: ${msg}` };
  }
}

/**
 * Strip "Note:" prefixes and disclaimer sentences from section content
 * before persisting. The model has very strong RLHF training to be
 * transparent about uncertainty, which manifests as preface notes about
 * what couldn't be fetched, what was JavaScript-rendered, etc. The
 * prompt asks the model not to do this; this function enforces it.
 *
 * Two-pass filter:
 *   (1) Drop any LINE that starts with "Note:", "Disclaimer:", or "Caveat:"
 *       (handles "> Note: ..." blockquote prefaces too).
 *   (2) Drop any SENTENCE matching known disclaimer phrasings, then drop
 *       any paragraph that becomes empty after sentence-filtering.
 *
 * Patterns are intentionally broad — false positives on candidate-facing
 * prose using these phrases are extremely unlikely.
 */
export function stripMetaCommentary(content: string): string {
  const linePrefixPatterns: RegExp[] = [
    /^>?\s*\*{0,2}\s*(?:Note|Disclaimer|Caveat|Important|Heads[ -]?up)\s*\*{0,2}\s*:/i,
  ];

  const sentencePatterns: RegExp[] = [
    /javascript[\s-]?rendered/i,
    /js[\s-]?rendered/i,
    /could not (?:be )?retriev/i,
    /could not (?:be )?fetch/i,
    /could not (?:be )?access/i,
    /the analysis below is based on/i,
    /per the hard rules/i,
    /returned only (?:css|js|javascript|html|a |the |bundle)/i,
    /returned no (?:body |readable )?(?:text|content)/i,
    /returned (?:only |just )(?:a |the )?(?:css|bundle)/i,
    /(?:without|with limited|with no) (?:direct )?access to/i,
    /given the limited (?:information|context|details|content)/i,
    /sources (?:were|are) (?:unavailable|inaccessible)/i,
    /based on the confirmed role title/i,
    /the (?:job description|JD)(?:'s)? (?:page|body|content) (?:could not be|was not|wasn't)/i,
    /(?:JD|job description) (?:page |body |content )?(?:could not|wasn't|was not) (?:retrieved|fetched|accessed)/i,
    /this assessment is (?:provisional|preliminary|limited)/i,
    /(?:since|because) the (?:JD|job description|page) (?:could not|was|returned)/i,
  ];

  // Pass 1: line-level prefix drops.
  const linesKept = content
    .split("\n")
    .filter((line) => !linePrefixPatterns.some((p) => p.test(line.trim())));

  // Pass 2: sentence-level filter within each paragraph.
  const paragraphs = linesKept.join("\n").split(/\n{2,}/);
  const cleanedParagraphs = paragraphs
    .map((para) => {
      const sentences = para.split(/(?<=[.!?])\s+/);
      const kept = sentences.filter(
        (s) => !sentencePatterns.some((p) => p.test(s)),
      );
      return kept.join(" ").trim();
    })
    .filter((p) => p.length > 0);

  return cleanedParagraphs.join("\n\n").trim();
}

export function runSaveFinding(input: Record<string, unknown>): ToolOutcome {
  const kind = input.kind as DeepDiveSectionKind;
  const rawContent = typeof input.content === "string" ? input.content : "";
  if (!kind || !VALID_SECTIONS.includes(kind)) {
    return { ok: false, preview: "bad kind", content: `Unknown section kind. Must be one of: ${VALID_SECTIONS.join(", ")}.` };
  }
  if (!rawContent.trim()) {
    return { ok: false, preview: "empty", content: "content was empty." };
  }

  // Strip "Note:" prefaces and disclaimer sentences before persisting.
  const cleaned = stripMetaCommentary(rawContent);

  if (!cleaned.trim()) {
    return {
      ok: false,
      preview: "all meta",
      content:
        "Your section body was entirely meta-commentary (Notes about JS-rendered pages, fetch failures, limited info, etc.) and was rejected. Rewrite using only what you DO have, in confident user-facing voice — no Notes, no caveats, no references to fetch results. If you can't produce useful content without disclaimers, do not call save_finding for this section.",
    };
  }

  // If the sanitizer removed substantial content, warn the model so it
  // tightens up future saves in this run (other sections still pending).
  const trimmedRatio = cleaned.length / rawContent.length;
  if (trimmedRatio < 0.7 && rawContent.length > 200) {
    return {
      ok: true,
      preview: `${kind} (cleaned)`,
      content: `Saved section "${kind}", but the harness stripped a substantial amount of meta-commentary from your body before saving. Future save_finding calls in this run: do not include "Note:" prefaces, sentences about JavaScript-rendered pages, "could not be retrieved", "the analysis below is based on", "given the limited information", or similar disclaimer language. Write in confident user-facing voice.`,
      section: { kind, content: cleaned },
    };
  }

  return {
    ok: true,
    preview: kind,
    content: `Saved section "${kind}".`,
    section: { kind, content: cleaned },
  };
}

export interface RunDeepDiveArgs {
  userId: string;
  job: Job;
  onEvent: DeepDiveEventCallback;
}

/**
 * Run the deep-dive agent for one job. Loops through tool_use turns until the
 * model emits end_turn or we hit the iteration cap. Emits typed events through
 * onEvent — the route adapter persists section_saved into Postgres.
 */
export async function runDeepDive({
  userId,
  job,
  onEvent,
}: RunDeepDiveArgs): Promise<void> {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    onEvent({ type: "error", message: "ANTHROPIC_API_KEY is not set." });
    return;
  }
  const resumeContext = await loadResumeContext(userId);

  const initialPrompt =
    `Here is one job posting to deep-dive on:\n\n` +
    `Company: ${job.company}\n` +
    `Title: ${job.title}\n` +
    `Location: ${job.location}\n` +
    `URL: ${job.url}\n` +
    `Source: ${job.source}\n\n` +
    `Job description:\n${job.description.slice(0, 6000)}\n\n` +
    `Start by reading the JD if you need more than the excerpt above, then research the company. Save each section as you complete it.`;

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: initialPrompt },
  ];

  let iteration = 0;
  let fetches = 0;
  const saved = new Set<DeepDiveSectionKind>();
  // Cache successful (and failed) fetches within this run. Models sometimes
  // re-request a URL after a few turns ("am I sure the GitHub didn't change?")
  // — returning the cached result keeps the conversation correct without
  // burning another slot from the candidate's MAX_FETCHES budget.
  const fetchCache = new Map<string, ToolOutcome>();

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    onEvent({ type: "iteration", n: iteration });

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 2048,
        tools: TOOLS,
        system: [
          { type: "text", text: SYSTEM_PROMPT },
          {
            type: "text",
            text: resumeContext,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
      } as unknown as Anthropic.MessageCreateParamsNonStreaming);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onEvent({ type: "error", message: `${msg}` });
      return;
    }

    if (response.stop_reason === "end_turn") {
      onEvent({ type: "done", sectionsSaved: saved.size });
      return;
    }

    if (response.stop_reason !== "tool_use") {
      onEvent({
        type: "error",
        message: `Unexpected stop_reason: ${response.stop_reason}`,
      });
      return;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const name = block.name as ToolName;
      const input = (block.input ?? {}) as Record<string, unknown>;
      onEvent({ type: "tool_use", name, input });

      let outcome: ToolOutcome;
      if (name === "fetch_url") {
        const u = typeof input.url === "string" ? input.url : "";
        if (isBlockedHost(u)) {
          // Short-circuit known-blocked hosts BEFORE incrementing the fetch
          // budget — we know they'll fail, and we don't want a guaranteed
          // dud to eat one of the candidate's 5 fetches.
          outcome = {
            ok: false,
            preview: "blocked",
            content:
              "This host blocks programmatic fetches (LinkedIn returns 999/403/login-wall). Do not retry this URL. If the candidate's LinkedIn URL is the issue, reference it as a fact in the cover letter without fetching it.",
          };
        } else if (fetchCache.has(u)) {
          // Duplicate fetch within this run. Return the cached outcome with a
          // strong nudge so the model stops trying to refresh the same URL.
          const cached = fetchCache.get(u)!;
          outcome = {
            ok: cached.ok,
            preview: "cached",
            content: `You already fetched this URL earlier in this run. The prior result is unchanged within a single dive. Do not fetch the same URL again. Original result:\n\n${cached.content}`,
          };
        } else if (fetches >= MAX_FETCHES) {
          outcome = {
            ok: false,
            preview: "cap",
            content: `Fetch budget exhausted (${MAX_FETCHES}).`,
          };
        } else {
          fetches++;
          outcome = await runFetchUrl(u);
          // Cache both successes and failures so the model doesn't burn slots
          // retrying a URL that failed once.
          fetchCache.set(u, outcome);
        }
      } else if (name === "save_finding") {
        outcome = runSaveFinding(input);
        if (outcome.ok && outcome.section) {
          saved.add(outcome.section.kind);
          onEvent({
            type: "section_saved",
            kind: outcome.section.kind,
            content: outcome.section.content,
          });
        }
      } else {
        outcome = {
          ok: false,
          preview: "unknown tool",
          content: `Unknown tool: ${name}`,
        };
      }

      onEvent({
        type: "tool_result",
        name,
        ok: outcome.ok,
        preview: outcome.preview,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: outcome.content,
        is_error: !outcome.ok,
      });
    }

    if (toolResults.length === 0) {
      onEvent({ type: "done", sectionsSaved: saved.size });
      return;
    }

    messages.push({ role: "user", content: toolResults });
  }

  onEvent({
    type: "error",
    message: `Hit iteration cap (${MAX_ITERATIONS}) before end_turn.`,
  });
}

// Re-export so the route can construct event types without two import paths.
export type { DeepDiveEvent } from "./types";
