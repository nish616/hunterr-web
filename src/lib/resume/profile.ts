import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { AI_MODEL } from "@/lib/hunt/config";
import { db, schema } from "@/lib/db";

// Role-agnostic: works for engineers, designers, PMs, etc. Claude infers the
// person's field from the résumé itself rather than us assuming engineering.
const PROFILE_SYSTEM_PROMPT = `You are an expert recruiter parsing a candidate's resume.
First infer the candidate's profession/field from the resume (e.g. software engineering, product design, product management, data, marketing).
Then extract a concise, structured profile that will be used to evaluate job-role fit.
Be accurate and grounded — do not invent skills or experience not present in the resume.
Output clean Markdown with these sections, in order:

## Headline
One sentence: name, current/most-recent role, field, and years of experience.

## Target Roles
3-6 role titles this person is well-positioned for, appropriate to their field.

## Core Skills
Comma-separated list of their strongest 8-15 skills, tools, or competencies (whatever is central to their field — e.g. languages/frameworks for engineers, Figma/prototyping/research for designers).

## Secondary Skills
Comma-separated list of additional skills they have working knowledge of.

## Experience Summary
3-5 bullet points covering domains, scope/scale, types of work, and seniority signals.

## Likely Dealbreakers
Bullet points of role characteristics that probably DON'T fit (e.g. "early-career-only roles", "no remote", "roles requiring a specialization they lack" — only if the resume signals it).`;

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

/**
 * Send resume text through Claude to produce a structured profile.
 * Saves both the raw text and the profile Markdown under the user's folder.
 */
export async function profileAndSaveResume(
  userId: string,
  resumeText: string,
): Promise<{ profileMd: string }> {
  if (!resumeText.trim()) {
    throw new Error("Empty resume text — extraction failed.");
  }

  const apiKey = await resolveApiKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set.");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: PROFILE_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: `Here is the resume:\n\n${resumeText}` },
    ],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find(
    (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
  );
  const profileMd = textBlock?.text.trim() ?? "";
  if (!profileMd) {
    throw new Error("Claude returned no profile content.");
  }

  await db
    .update(schema.users)
    .set({ resumeText, resumeProfile: profileMd })
    .where(eq(schema.users.id, userId));

  return { profileMd };
}

export async function loadCurrentProfile(userId: string): Promise<{
  profileMd: string;
  resumeText: string;
  exists: boolean;
}> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { resumeText: true, resumeProfile: true },
  });
  const profileMd = row?.resumeProfile ?? "";
  const resumeText = row?.resumeText ?? "";
  return {
    profileMd,
    resumeText,
    exists: profileMd.length > 0 || resumeText.length > 0,
  };
}
