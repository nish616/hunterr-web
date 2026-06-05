import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/lib/db";
import { runDeepDive } from "@/lib/agent/deep-dive";
import { isPro } from "@/lib/subscription";
import { getSubscription } from "@/lib/subscription-server";
import type { DeepDiveEvent } from "@/lib/agent/types";
import type { Job } from "@/lib/hunt/types";

// Deep dives can take ~30-90s; bump the route timeout for local dev.
// Vercel Hobby still caps at 60s — flag for upgrade or cancellation UX.
export const maxDuration = 300;

function isJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const j = value as Record<string, unknown>;
  return (
    typeof j.company === "string" &&
    typeof j.title === "string" &&
    typeof j.url === "string" &&
    typeof j.description === "string"
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const subscription = await getSubscription(userId);
  if (!isPro(subscription.tier)) {
    return NextResponse.json(
      {
        error: "Deep dive requires Pro. Request an upgrade to enable it.",
      },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { job?: unknown };
  if (!isJob(body.job)) {
    return NextResponse.json({ error: "Missing or invalid job payload." }, { status: 400 });
  }
  const job = body.job;

  // Upsert the dive row: same (user, jobUrl) pair reuses the row. Reset its
  // status so a re-run starts clean.
  const existing = await db.query.jobDeepDives.findFirst({
    where: and(
      eq(schema.jobDeepDives.userId, userId),
      eq(schema.jobDeepDives.jobUrl, job.url),
    ),
  });

  let diveId: string;
  if (existing) {
    diveId = existing.id;
    await db
      .update(schema.jobDeepDives)
      .set({
        status: "running",
        sections: {},
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobDeepDives.id, diveId));
  } else {
    const [inserted] = await db
      .insert(schema.jobDeepDives)
      .values({
        userId,
        jobUrl: job.url,
        jobCompany: job.company,
        jobTitle: job.title,
        status: "running",
        sections: {},
      })
      .returning({ id: schema.jobDeepDives.id });
    diveId = inserted.id;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: DeepDiveEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      send({ type: "started", id: diveId });

      try {
        await runDeepDive({
          userId,
          job,
          onEvent: (event) => {
            send(event);
            if (event.type === "section_saved") {
              // Persist incrementally so a refresh during the run still shows
              // partial results. Fire-and-forget — DB hiccups shouldn't kill
              // the stream.
              persistSection(diveId, event.kind, event.content).catch((err) => {
                console.error("persist section failed:", err);
              });
            }
          },
        });

        await db
          .update(schema.jobDeepDives)
          .set({ status: "complete", updatedAt: new Date() })
          .where(eq(schema.jobDeepDives.id, diveId));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Deep dive failed:", err);
        send({ type: "error", message: msg });
        await db
          .update(schema.jobDeepDives)
          .set({ status: "failed", error: msg, updatedAt: new Date() })
          .where(eq(schema.jobDeepDives.id, diveId));
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

async function persistSection(
  diveId: string,
  kind: string,
  content: string,
) {
  // Read-modify-write the sections jsonb. Neon's HTTP driver is stateless, so
  // we accept the race window between concurrent saves of different sections —
  // it's fine in practice because save_finding calls don't overlap within a
  // single agent turn.
  const row = await db.query.jobDeepDives.findFirst({
    where: eq(schema.jobDeepDives.id, diveId),
    columns: { sections: true },
  });
  const next = { ...(row?.sections ?? {}), [kind]: { content, savedAt: Date.now() } };
  await db
    .update(schema.jobDeepDives)
    .set({ sections: next, updatedAt: new Date() })
    .where(eq(schema.jobDeepDives.id, diveId));
}

/**
 * GET — fetch the persisted dive for a given jobUrl, so the panel can show
 * prior results on reopen without re-running the agent.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const jobUrl = url.searchParams.get("jobUrl");
  if (!jobUrl) {
    return NextResponse.json({ error: "Missing jobUrl." }, { status: 400 });
  }
  const row = await db.query.jobDeepDives.findFirst({
    where: and(
      eq(schema.jobDeepDives.userId, session.user.id),
      eq(schema.jobDeepDives.jobUrl, jobUrl),
    ),
  });
  if (!row) return NextResponse.json({ dive: null });
  return NextResponse.json({
    dive: {
      id: row.id,
      status: row.status,
      sections: row.sections,
      error: row.error,
      updatedAt: row.updatedAt,
    },
  });
}
