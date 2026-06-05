import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runHunt } from "@/lib/hunt/pipeline";
import { isPro } from "@/lib/subscription";
import { getSubscription } from "@/lib/subscription-server";
import type { FilterOverrides, HuntProgress } from "@/lib/hunt/types";

// AI scoring + fetches can take 60-90s; raise the route timeout for local dev.
// On Vercel Hobby the timeout is hard-capped at 60s, so both deferred for now.
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

  // Tier gate. AI hunts (scoring + triage) require Pro;
  if (withAi) {
    const subscription = await getSubscription(session.user.id);
    if (!isPro(subscription.tier)) {
      return NextResponse.json(
        {
          error:
            "AI scoring requires Pro. Run without AI, or request an upgrade.",
        },
        { status: 403 },
      );
    }
  }

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

  // Stream progress events as newline-delimited JSON (NDJSON). The client reads
  // each line and updates the live status; the final line carries the result.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: HuntProgress) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        const result = await runHunt({
          userId: session.user.id,
          withAi,
          filters,
          onProgress: send,
        });
        send({ type: "result", result });
      } catch (err) {
        console.error("Hunt failed:", err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Hunt failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
