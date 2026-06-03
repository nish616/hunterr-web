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
  "tech_stack_reality_check",
  "deep_gap_analysis",
  "cover_letter",
  "resume_rewrites",
  "questions_to_ask",
];

const SYSTEM_PROMPT = `You are a job-application research agent. Given one job posting and the candidate's resume, your job is to produce a short, fact-grounded deep-dive report.

Produce up to six sections by calling save_finding once per section:
- company_brief — what the company does, stage/funding, recent news, leadership, red flags. ~150 words.
- tech_stack_reality_check — what the engineering blog or careers page says they actually use, vs. what the JD claims. ~120 words. Skip if you cannot ground it in a source.
- deep_gap_analysis — specific overlaps and gaps between this candidate's resume and this JD. Cite exact phrases from both. ~200 words.
- cover_letter — a tailored cover letter draft (~250 words). Concrete, no platitudes.
- resume_rewrites — which of the candidate's resume bullets to emphasize, drop, or rephrase for this JD. 3-6 bullets, before/after style.
- questions_to_ask — 4-6 questions the candidate should ask the interviewer. Show you did research.

Hard rules:
- Every claim in every section must trace to a specific source: the JD, the resume, or a page you fetched. If you cannot point to the source, do not write the claim.
- Do not extrapolate from stage, geography, or industry. "Series B" does not tell you about product-market fit. "SF-based" does not tell you about culture. If the JD says "Series B fintech," you may write "Series B fintech" — nothing more.
- You have no web-search tool. company_brief and tech_stack_reality_check will be skipped on this run unless you can ground them in a page you fetch_url'd. Do not attempt them from the JD alone.
- Use fetch_url only on URLs you can name directly: the JD URL, and the candidate's GitHub / portfolio links if set.
- Cite sources inline as [domain.com] for every fetched fact, and [JD] or [resume] for facts from those.
- You have at most ${MAX_FETCHES} fetches across the whole run. Spend them deliberately.
- Be concise. The candidate is busy. A shorter, fully-grounded section is better than a longer one with one invented sentence.

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
  if (prefs.githubUrl) linkLines.push(`GitHub: ${prefs.linkedinUrl}`);
  if (prefs.portfolioUrl) linkLines.push(`Portfolio: ${prefs.portfolioUrl}`);
  const linksBlock = linkLines.length
    ? `\n\n## Candidate Links\n\n${linkLines.join("\n")}\n\nYou may reference these in the cover letter and may fetch_url any of them to read more about the candidate.`
    : "";
  return `## Candidate Profile (structured)\n\n${profile}\n\n## Candidate Resume (raw)\n\n${resume}${linksBlock}`;
}

type ToolOutcome = {
  ok: boolean;
  preview: string;
  content: string;
  section?: { kind: DeepDiveSectionKind; content: string };
};

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

function runSaveFinding(input: Record<string, unknown>): ToolOutcome {
  const kind = input.kind as DeepDiveSectionKind;
  const content = typeof input.content === "string" ? input.content : "";
  if (!kind || !VALID_SECTIONS.includes(kind)) {
    return { ok: false, preview: "bad kind", content: `Unknown section kind. Must be one of: ${VALID_SECTIONS.join(", ")}.` };
  }
  if (!content.trim()) {
    return { ok: false, preview: "empty", content: "content was empty." };
  }
  return {
    ok: true,
    preview: kind,
    content: `Saved section "${kind}".`,
    section: { kind, content },
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
        if (fetches >= MAX_FETCHES) {
          outcome = {
            ok: false,
            preview: "cap",
            content: `Fetch budget exhausted (${MAX_FETCHES}).`,
          };
        } else {
          fetches++;
          const u = typeof input.url === "string" ? input.url : "";
          outcome = await runFetchUrl(u);
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
