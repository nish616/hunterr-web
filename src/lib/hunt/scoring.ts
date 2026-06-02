import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Job, ProgressCallback, Verdict } from "./types";
import { AI_MODEL, AI_MAX_CONCURRENCY, AI_TRIAGE_MODEL } from "./config";
import { db, schema } from "@/lib/db";

export const FitAnalysisSchema = z.object({
  fit_score: z.number().int().min(1).max(10),
  verdict: z.enum(["strong", "stretch", "skip"]),
  strengths: z.array(z.string()).min(1).max(3),
  gaps: z.array(z.string()).max(3),
  summary: z.string(),
});
export type FitAnalysis = z.infer<typeof FitAnalysisSchema>;

// JSON Schema passed to the API for guaranteed structured output.
// Anthropic's structured outputs don't accept numerical/array length constraints
// in the schema, so we keep them only on the Zod side for client-side validation.
const FIT_JSON_SCHEMA = {
  type: "object",
  properties: {
    fit_score: { type: "integer", description: "Overall fit 1 (poor) to 10 (excellent)." },
    verdict: { type: "string", enum: ["strong", "stretch", "skip"] },
    strengths: { type: "array", items: { type: "string" }, description: "1-3 concrete reasons this role fits the candidate." },
    gaps: { type: "array", items: { type: "string" }, description: "0-3 specific gaps or concerns." },
    summary: { type: "string", description: "One sentence explaining the verdict." },
  },
  required: ["fit_score", "verdict", "strengths", "gaps", "summary"],
  additionalProperties: false,
} as const;

// Role-agnostic — works for any field (engineering, design, product, data, etc.).
// Claude infers the candidate's profession from their résumé/profile and judges
// fit against the JD's actual requirements, whatever the discipline.
const FIT_INSTRUCTIONS = `You are evaluating how well a single job description fits a specific candidate based on their resume and profile.
First infer the candidate's profession/field from their profile, then judge fit against this role's actual requirements for that field.
Be honest and concise. Reward concrete overlap between the candidate's experience and the role's requirements. Penalize roles that demand expertise the candidate lacks.

When grading, weigh these signals in order of importance:
- Hard eligibility: location, work authorization, and visa requirements often disqualify before fit does — treat geofenced "Remote" roles (Remote - US, Remote - Canada, etc.) as likely barriers if the candidate is based elsewhere.
- Seniority calibration: years of experience and current level matter; missing 1-2 years for a senior role is a stretch, missing 4+ is usually a skip. Applying significantly above one's current level (e.g. to a Staff / Principal / Lead / Head-of role) is almost always a skip unless the impact narrative is exceptional.
- Requirement overlap: alignment on the role's core required skills, tools, or competencies outweighs adjacent ones. Distinguish must-haves from nice-to-haves — a missing must-have is usually a deal-breaker; a missing nice-to-have rarely is. (For engineers this is the tech stack; for designers it's tools like Figma plus competencies like user research, design systems, prototyping; judge by what THIS role actually requires.)
- Domain context: prior experience in the role's domain (fintech, devtools, healthcare, consumer, etc.) is a meaningful differentiator. Absence is a soft gap, not a hard one, unless the role is explicitly domain-led.

A "strong" verdict means the candidate is well-positioned, the eligibility checks pass, and they should apply with high confidence.
A "stretch" verdict means it's worth applying but with notable gaps the candidate will need to address in cover-letter framing.
A "skip" verdict means the role likely isn't a good use of time — hard eligibility issues, deep requirement mismatch, or significant seniority gap.

Be specific in strengths and gaps — point to concrete claims in the resume and concrete requirements in the JD, not generic praise or hedging. Quote exact phrases where useful.`;

/**
 * Returns ANTHROPIC_API_KEY, preferring process.env but falling back to a
 * direct read of .env.local. Works around the Claude Code harness exporting
 * ANTHROPIC_API_KEY="" (empty), which Next.js refuses to override from .env.local.
 */
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
    columns: { resumeText: true, resumeProfile: true },
  });
  const profile = row?.resumeProfile ?? "";
  const resume = row?.resumeText ?? "";
  if (!profile && !resume) {
    throw new Error(
      "No résumé found for your account. Upload one on the Résumé page first.",
    );
  }
  return `## Candidate Profile (structured)\n\n${profile}\n\n## Candidate Resume (raw)\n\n${resume}`;
}

async function loadProfileOnly(userId: string): Promise<string> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { resumeProfile: true, resumeText: true },
  });
  // Prefer the compact structured profile; fall back to raw text.
  return row?.resumeProfile || row?.resumeText || "";
}

const TRIAGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    selected: {
      type: "array",
      items: { type: "integer" },
      description: "Indices of the selected postings, best fit first.",
    },
  },
  required: ["selected"],
  additionalProperties: false,
} as const;

/**
 * Cheap relevance triage with Haiku. Given the full matched pool, returns the
 * `limit` best-fitting jobs (by seniority fit + skill overlap) so the expensive
 * Sonnet scoring only runs on jobs worth a careful verdict.
 *
 * Falls back to the existing keyword ranking (the input order) on any failure,
 * or when there's already <= limit jobs (no point spending a call).
 */
export async function triageJobs(
  jobs: Job[],
  userId: string,
  limit: number,
  onProgress?: ProgressCallback,
): Promise<Job[]> {
  onProgress?.({ type: "triaging", pool: jobs.length });

  if (jobs.length <= limit) {
    onProgress?.({ type: "triaged", selected: jobs.length });
    return jobs;
  }

  const fallback = () => {
    onProgress?.({ type: "triaged", selected: Math.min(limit, jobs.length) });
    return jobs.slice(0, limit);
  };

  const apiKey = await resolveApiKey();
  if (!apiKey) return fallback();

  const profile = await loadProfileOnly(userId);
  if (!profile) return fallback();

  // Compact one-line summary per job, with a stable index.
  const summaries = jobs
    .map(
      (j, i) =>
        `${i}. ${j.title} — ${j.company} (${j.location || "?"}) [skills: ${
          j.matchedSkills.join(", ") || "none"
        }]`,
    )
    .join("\n");

  const prompt =
    `Candidate profile:\n${profile}\n\n` +
    `Here are ${jobs.length} job postings as "index. title — company (location) [matched skills]":\n${summaries}\n\n` +
    `Select the ${limit} postings that best fit this candidate. Judge primarily by:\n` +
    `1. Seniority fit — penalize roles clearly above the candidate's level (e.g. Staff / Principal / Lead / Head-of when the candidate is mid-level) or clearly below it.\n` +
    `2. Overlap between the role and the candidate's core skills and experience.\n` +
    `Return the indices of the selected postings, best fit first, at most ${limit}.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: AI_TRIAGE_MODEL,
      max_tokens: 1024,
      output_config: {
        format: { type: "json_schema", schema: TRIAGE_JSON_SCHEMA },
      },
      messages: [{ role: "user", content: prompt }],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming);

    const textBlock = response.content.find(
      (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return fallback();

    const parsed = JSON.parse(textBlock.text) as { selected?: unknown };
    if (!Array.isArray(parsed.selected)) return fallback();

    // Validate, dedupe, keep in-range, cap to limit.
    const seen = new Set<number>();
    const picked: Job[] = [];
    for (const raw of parsed.selected) {
      const i = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(i) || i < 0 || i >= jobs.length) continue;
      if (seen.has(i)) continue;
      seen.add(i);
      picked.push(jobs[i]);
      if (picked.length >= limit) break;
    }
    if (picked.length === 0) return fallback();

    onProgress?.({ type: "triaged", selected: picked.length });
    return picked;
  } catch (err) {
    console.error(
      "Triage failed, falling back to keyword ranking:",
      err instanceof Error ? err.message : err,
    );
    return fallback();
  }
}

async function scoreOne(
  client: Anthropic,
  resumeContext: string,
  job: Job,
): Promise<FitAnalysis | null> {
  const jd =
    `Company: ${job.company}\n` +
    `Title: ${job.title}\n` +
    `Location: ${job.location}\n` +
    `Source: ${job.source}\n\n` +
    `Description:\n${job.description.slice(0, 8000)}`;

  try {
    // Cast through unknown because effort + structured outputs are newer SDK params
    // not yet in the published types of every SDK version.
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: FIT_JSON_SCHEMA },
      },
      system: [
        {
          type: "text",
          text: FIT_INSTRUCTIONS,
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: resumeContext },
      ],
      messages: [{ role: "user", content: jd }],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming);

    const textBlock = response.content.find(
      (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return null;

    const parsed = FitAnalysisSchema.safeParse(JSON.parse(textBlock.text));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.error(
      `AI scoring failed for ${job.company}/${job.title.slice(0, 40)}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Score jobs with Claude. Warms the cache with one sequential call,
 * then runs the rest with bounded concurrency.
 */
export async function scoreJobs(
  jobs: Job[],
  userId: string,
  onProgress?: ProgressCallback,
): Promise<Job[]> {
  if (jobs.length === 0) return [];

  const resumeContext = await loadResumeContext(userId);
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local.",
    );
  }
  const client = new Anthropic({ apiKey });
  const scored: Job[] = [];
  const total = jobs.length;
  onProgress?.({ type: "scoring", done: 0, total });

  // Process all jobs with bounded concurrency.
  for (let i = 0; i < jobs.length; i += AI_MAX_CONCURRENCY) {
    const batch = jobs.slice(i, i + AI_MAX_CONCURRENCY);
    const results = await Promise.all(
      batch.map((j) => scoreOne(client, resumeContext, j)),
    );
    results.forEach((r, idx) => scored.push(attach(batch[idx], r)));
    onProgress?.({ type: "scoring", done: scored.length, total });
  }

  return scored;
}

function attach(job: Job, fit: FitAnalysis | null): Job {
  if (!fit) return job;
  return {
    ...job,
    aiScore: fit.fit_score,
    aiVerdict: fit.verdict as Verdict,
    aiStrengths: fit.strengths,
    aiGaps: fit.gaps,
    aiSummary: fit.summary,
  };
}
