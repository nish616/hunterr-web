import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { AI_MODEL } from "@/lib/hunt/config";
import { DATA_DIR, PROFILE_MD_PATH, RESUME_TXT_PATH } from "./paths";

const PROFILE_SYSTEM_PROMPT = `You are an expert technical recruiter parsing an engineering resume.
Extract a concise, structured profile that will be used to evaluate job-role fit.
Be accurate and grounded — do not invent skills or experience not present in the resume.
Output clean Markdown with these sections, in order:

## Headline
One sentence: name, current/most-recent role, years of experience.

## Target Roles
3-6 role titles this person is well-positioned for.

## Core Skills
Comma-separated list of the strongest 8-15 technical skills.

## Secondary Skills
Comma-separated list of additional skills they have working knowledge of.

## Experience Summary
3-5 bullet points covering domains, scale, types of systems, and seniority signals.

## Likely Dealbreakers
Bullet points of role characteristics that probably DON'T fit (e.g. "early-career-only roles", "no remote", "deep ML research roles" — only if the resume signals it).`;

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
 * Saves both the raw text and the profile Markdown to data/.
 */
export async function profileAndSaveResume(
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

  await fs.mkdir(DATA_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(RESUME_TXT_PATH, resumeText, "utf-8"),
    fs.writeFile(PROFILE_MD_PATH, profileMd, "utf-8"),
  ]);

  return { profileMd };
}

export async function loadCurrentProfile(): Promise<{
  profileMd: string;
  resumeText: string;
  exists: boolean;
}> {
  const [profileMd, resumeText] = await Promise.all([
    fs.readFile(PROFILE_MD_PATH, "utf-8").catch(() => ""),
    fs.readFile(RESUME_TXT_PATH, "utf-8").catch(() => ""),
  ]);
  return {
    profileMd,
    resumeText,
    exists: profileMd.length > 0 || resumeText.length > 0,
  };
}
