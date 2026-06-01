import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Job, Verdict } from "./types";
import { AI_MODEL, AI_MAX_CONCURRENCY } from "./config";

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

const FIT_INSTRUCTIONS = `You are evaluating how well a single job description fits a specific candidate based on their resume and profile.
Be honest and concise. Reward concrete skill overlap and relevant scale. Penalize roles that demand expertise the candidate lacks.

When grading, weigh these signals in order of importance:
- Hard eligibility: location, work authorization, and visa requirements often disqualify before skills do — treat geofenced "Remote" roles (Remote - US, Remote - Canada, etc.) as likely barriers if the candidate is based elsewhere.
- Seniority calibration: years of experience and current title matter; missing 1-2 years for a senior role is a stretch, missing 4+ is usually a skip. A Software Engineer II applying to Staff+ roles is almost always a skip unless their impact narrative is exceptional.
- Skill overlap: alignment on the JD's core stack outweighs adjacent tooling. Distinguish must-haves from nice-to-haves — a missing must-have is usually a deal-breaker; a missing nice-to-have rarely is.
- Domain context: prior experience in the JD's domain (fintech, devtools, security, ML infra, etc.) is a meaningful differentiator. Absence is a soft gap, not a hard one, unless the role is explicitly domain-led.

A "strong" verdict means the candidate is well-positioned, the eligibility checks pass, and they should apply with high confidence.
A "stretch" verdict means it's worth applying but with notable gaps the candidate will need to address in cover-letter framing.
A "skip" verdict means the role likely isn't a good use of time — hard eligibility issues, deep stack mismatch, or significant seniority gap.

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

async function loadResumeContext(): Promise<string> {
  const dataDir = path.join(process.cwd(), "data");
  const [profile, resume] = await Promise.all([
    fs.readFile(path.join(dataDir, "profile.md"), "utf-8").catch(() => ""),
    fs.readFile(path.join(dataDir, "resume.txt"), "utf-8").catch(() => ""),
  ]);
  if (!profile && !resume) {
    throw new Error(
      "No resume found. Add data/resume.txt and data/profile.md.",
    );
  }
  return `## Candidate Profile (structured)\n\n${profile}\n\n## Candidate Resume (raw)\n\n${resume}`;
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
        { type: "text", text: FIT_INSTRUCTIONS },
        {
          type: "text",
          text: resumeContext,
          cache_control: { type: "ephemeral" },
        },
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
export async function scoreJobs(jobs: Job[]): Promise<Job[]> {
  if (jobs.length === 0) return [];

  const resumeContext = await loadResumeContext();
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local.",
    );
  }
  const client = new Anthropic({ apiKey });
  const scored: Job[] = [];

  // Warm the cache sequentially with the first call.
  const first = await scoreOne(client, resumeContext, jobs[0]);
  scored.push(attach(jobs[0], first));

  // Process the rest with bounded concurrency.
  const rest = jobs.slice(1);
  for (let i = 0; i < rest.length; i += AI_MAX_CONCURRENCY) {
    const batch = rest.slice(i, i + AI_MAX_CONCURRENCY);
    const results = await Promise.all(
      batch.map((j) => scoreOne(client, resumeContext, j)),
    );
    results.forEach((r, idx) => scored.push(attach(batch[idx], r)));
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
