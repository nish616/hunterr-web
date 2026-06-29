import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { runHunt } from "@/lib/hunt/pipeline";
import { isPro } from "@/lib/subscription";
import { DEFAULT_AUTO_RUN } from "@/lib/db/schema";
import { isAlertDue, diffNewJobs } from "@/lib/auto-run";
import type { FilterOverrides } from "@/lib/hunt/types";
import { Tier } from "@/lib/constants";
import { getResendClient } from "@/lib/resend";
import { JobAlertEmail } from "@/components/emails/jobAlertEmail";
import { Job } from "@/types/job";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

const MAX_USERS_PER_TICK = 10;

type Alert = {
  userId: string,
  email: string,
  length: number,
  jobs: Job[],
  wouldAlert: boolean,
  reason: string,
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }
  if (req.headers.get("Authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const alerts: Array<Alert> = [];
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
          alerts.push({
            userId: user.id,
            email: user.email,
            length: 0,
            jobs: [],
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

        const jobs = result.jobs
          .map((j) => {
            const { title, company, postedAt, location, url } = j;
            return {
              title,
              company,
              postedAt,
              location,
              url
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
          lastAlert: prefs.lastAlert
        };

        const newUrls = jobs.map(x => x.url);
        const newJobs = diffNewJobs(jobs, newUrls);

        let wouldAlert = false;
        let reason: string;
        if (newJobs.length === 0) {
          reason = "no new jobs since last alert";
        } else if (!isAlertDue(schedulePrefs)) {
          reason = "outside window or interval not elapsed";
        } else {
          wouldAlert = true;
          reason = `${jobs.length} new job(s)`;
        }

        alerts.push({
          userId: user.id,
          email: user.email,
          length: newJobs.length,
          jobs: newJobs,
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
    wouldAlert: alerts.filter((d) => d.wouldAlert).length,
    alerts,
    errors,
  };

  for (const alert of alerts) {
    if (!alert.jobs.length) continue;

    console.log("Sending mail....");

    const resend = getResendClient();

    const today = new Date();

    const formattedDate = [
      String(today.getDate()).padStart(2, "0"),
      String(today.getMonth() + 1).padStart(2, "0"),
      today.getFullYear(),
    ].join("-");

    const subject = `Job Alert ${formattedDate}`;

    console.log("Email subject", subject);

    const { data, error } = await resend.emails.send({
      from: "hunterr-alerts@hunterr.nishins.dev",
      to: alert.email,
      subject: subject,
      react: JobAlertEmail({ jobs: alert.jobs })
    });
    if (error) {
      console.error("Error in sending email", error);
      continue;
    }
  }

  await presistLastAlertDetails(alerts);

  console.log("Auto run summary: ", summary);

  return NextResponse.json(summary);
}

function parseList(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function presistLastAlertDetails(alerts: Alert[]) {
  try {
    for (const alert of alerts) {
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, alert.userId),
        columns: { preferences: true },
      });

      const prefrences = user?.preferences || {};

      prefrences.lastAlert = alert.jobs.map(x => x.url);
      prefrences.lastAlertSentAt = new Date().toISOString();


      await db
        .update(schema.users)
        .set({ preferences: prefrences })
        .where(eq(schema.users.id, alert.userId));
    }

  } catch (Err) {
    console.error("Error update alert")
    return;
  }

}
