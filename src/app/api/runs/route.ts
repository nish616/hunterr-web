import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runHunt } from "@/lib/hunt/pipeline";
import type { FilterOverrides } from "@/lib/hunt/types";

// AI scoring + fetches can take 60-90s; raise the route timeout for local dev.
// On Vercel Hobby the timeout is hard-capped at 60s, so we'd need to either
// upgrade or stream — both deferred for now.
export const maxDuration = 300;

function sanitizeList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const withAi = url.searchParams.get("ai") !== "false";

  const body = (await req.json().catch(() => ({}))) as {
    filters?: {
      roles?: unknown;
      excludeTitles?: unknown;
      skills?: unknown;
      maxAgeDays?: unknown;
    };
  };
  const rawAge = body.filters?.maxAgeDays;
  const maxAgeDays =
    typeof rawAge === "number" && rawAge >= 0 ? rawAge : undefined;
  const filters: FilterOverrides = {
    roles: sanitizeList(body.filters?.roles),
    excludeTitles: sanitizeList(body.filters?.excludeTitles),
    skills: sanitizeList(body.filters?.skills),
    maxAgeDays,
  };

  // Titles and skills are required — reject the run if either is missing.
  if (filters.roles!.length === 0 || filters.skills!.length === 0) {
    return NextResponse.json(
      {
        error:
          "Set your preferred titles and skills in Profile before running a search.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runHunt({ withAi, filters });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Hunt failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Hunt failed" },
      { status: 500 },
    );
  }
}
