import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { runHunt } from "@/lib/hunt/pipeline";
import { isPro } from "@/lib/subscription";
import { DEFAULT_AUTO_RUN } from "@/lib/db/schema";
import { isAlertDue, diffNewJobs } from "@/lib/auto-run";
import type { FilterOverrides } from "@/lib/hunt/types";
import { Tier } from "@/lib/constants";

export const maxDuration = 60;

const MAX_USERS_PER_TICK = 10;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }
  console.log("Req Headers", req.headers);
  if (req.headers.get("Authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const jobs: Array<{
    userId: string;
    email: string;
    length: number;
    details: Array<Object>
    wouldAlert: boolean;
    reason: string;
  }> = [];
  const errors: Array<{ userId: string; error: string }> = [];

  const users = await db.query.users.findMany({
    columns: { id: true, email: true, preferences: true, subscription: true },
  });

  const eligible = users
    .filter((u) => isPro(u.subscription?.tier ?? Tier.Free))
    .filter((u) => u.preferences?.autoRunEnabled === true)
    .slice(0, MAX_USERS_PER_TICK);

  await Promise.all(
    eligible.map(async (user) => {
      try {
        const prefs = user.preferences ?? {};
        const filters: FilterOverrides = {
          roles: parseList(prefs.preferredTitles),
          excludeTitles: parseList(prefs.excludedTitles),
          skills: parseList(prefs.skills),
          maxAgeDays: prefs.maxAgeDays,
        };

        if (filters.roles!.length === 0 || filters.skills!.length === 0) {
          jobs.push({
            userId: user.id,
            email: user.email,
            length: 0,
            details: [],
            wouldAlert: false,
            reason: "missing titles or skills in profile",
          });
          return;
        }

        const result = await runHunt({
          userId: user.id,
          withAi: false,
          filters,
        });

        const jobDetails = result.jobs
          .map((j) => {
            const {title, company, postedAt, location, url} = j;
            return {
              title,
              company,
              postedAt,
              location
            }
          });

        const schedulePrefs = {
          alertFrequencyHours:
            prefs.alertFrequencyHours ?? DEFAULT_AUTO_RUN.alertFrequencyHours,
          alertStartHour:
            prefs.alertStartHour ?? DEFAULT_AUTO_RUN.alertStartHour,
          alertEndHour: prefs.alertEndHour ?? DEFAULT_AUTO_RUN.alertEndHour,
          alertTimezone: prefs.alertTimezone ?? DEFAULT_AUTO_RUN.alertTimezone,
          lastAlertSentAt: prefs.lastAlertSentAt,
        };

        let wouldAlert = false;
        let reason: string;
        if (jobDetails.length === 0) {
          reason = "no new jobs since last alert";
        } else if (!isAlertDue(schedulePrefs)) {
          reason = "outside window or interval not elapsed";
        } else {
          wouldAlert = true;
          reason = `${jobDetails.length} new job(s)`;
        }

        jobs.push({
          userId: user.id,
          email: user.email,
          length: jobDetails.length,
          details: jobDetails,
          wouldAlert,
          reason,
        });
      } catch (err) {
        errors.push({
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  const summary = {
    event: "auto_run_tick",
    durationMs: Date.now() - startedAt,
    totalUsers: users.length,
    eligibleUsers: eligible.length,
    wouldAlert: jobs.filter((d) => d.wouldAlert).length,
    jobs,
    errors,
  };

  console.log(JSON.stringify(summary));

  return NextResponse.json(summary);
}

function parseList(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
