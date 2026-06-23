"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ROLE_KEYWORDS, SKILL_KEYWORDS } from "@/lib/hunt/config";
import type { Subscription, UserPreferences } from "@/lib/db/schema";
import { DEFAULT_AUTO_RUN } from "@/lib/db/schema";
import { isPro, upgradeRequestMailto } from "@/lib/subscription";
import { savePreferencesAction } from "../actions";

type SaveState = "idle" | "saving" | "saved" | "error";

const DEFAULT_MAX_AGE_DAYS = 3;

const SEARCH_WINDOWS: { value: number; label: string }[] = [
  { value: 1, label: "Last 24 hours" },
  { value: 3, label: "Last 3 days" },
  { value: 7, label: "Last week" },
];

const ALERT_FREQUENCIES: { value: number; label: string }[] = [
  { value: 1, label: "Every hour" },
  { value: 2, label: "Every 2 hours" },
  { value: 4, label: "Every 4 hours" },
  { value: 6, label: "Every 6 hours" },
  { value: 12, label: "Every 12 hours" },
  { value: 24, label: "Once a day" },
];

// Curated list — full IANA list is 500+ entries; this covers India + the most
// common global timezones for the alpha. Add more as users ask.
const TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+5:30)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (UTC+8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (UTC+10/11)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST)" },
  { value: "America/New_York", label: "America/New York (ET)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (PT)" },
  { value: "UTC", label: "UTC" },
];

// 0-23 hour labels, with a friendly suffix.
const HOURS: { value: number; label: string }[] = Array.from(
  { length: 24 },
  (_, i) => {
    const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
    const ampm = i < 12 ? "am" : "pm";
    return { value: i, label: `${String(i).padStart(2, "0")}:00 (${h12}${ampm})` };
  },
);

export function ProfileForm({
  preferences,
  subscription,
  userEmail,
}: {
  preferences: UserPreferences;
  subscription: Subscription;
  userEmail: string;
}) {
  const isProUser = isPro(subscription.tier);
  const upgradeHref = upgradeRequestMailto(userEmail);
  const [preferredTitles, setPreferredTitles] = useState(
    preferences.preferredTitles ?? "",
  );
  const [excludedTitles, setExcludedTitles] = useState(
    preferences.excludedTitles ?? "",
  );
  const [skills, setSkills] = useState(preferences.skills ?? "");
  const [maxAgeDays, setMaxAgeDays] = useState<number>(
    preferences.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
  );
  const [linkedinUrl, setLinkedinUrl] = useState(preferences.linkedinUrl ?? "");
  const [githubUrl, setGithubUrl] = useState(preferences.githubUrl ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(preferences.portfolioUrl ?? "");

  const [autoRunEnabled, setAutoRunEnabled] = useState<boolean>(
    preferences.autoRunEnabled ?? false,
  );
  const [alertFrequencyHours, setAlertFrequencyHours] = useState<number>(
    preferences.alertFrequencyHours ?? DEFAULT_AUTO_RUN.alertFrequencyHours,
  );
  const [alertStartHour, setAlertStartHour] = useState<number>(
    preferences.alertStartHour ?? DEFAULT_AUTO_RUN.alertStartHour,
  );
  const [alertEndHour, setAlertEndHour] = useState<number>(
    preferences.alertEndHour ?? DEFAULT_AUTO_RUN.alertEndHour,
  );
  const [alertTimezone, setAlertTimezone] = useState<string>(
    preferences.alertTimezone ?? DEFAULT_AUTO_RUN.alertTimezone,
  );

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Titles and skills are required.
    if (!preferredTitles.trim() || !skills.trim()) {
      setSaveState("error");
      setError("Preferred titles and skills are both required.");
      return;
    }

    // Lightweight URL check: must be empty, or start with http(s)://.
    const links: [string, string][] = [
      ["LinkedIn", linkedinUrl],
      ["GitHub", githubUrl],
      ["Portfolio", portfolioUrl],
    ];
    for (const [name, value] of links) {
      const v = value.trim();
      if (v && !/^https?:\/\//i.test(v)) {
        setSaveState("error");
        setError(`${name} URL must start with http:// or https://`);
        return;
      }
    }

    if (autoRunEnabled && alertEndHour <= alertStartHour) {
      setSaveState("error");
      setError("Alert end hour must be after the start hour.");
      return;
    }

    setSaveState("saving");

    const res = await savePreferencesAction({
      preferredTitles: preferredTitles.trim(),
      excludedTitles: excludedTitles.trim() || undefined,
      skills: skills.trim(),
      maxAgeDays,
      linkedinUrl: linkedinUrl.trim() || undefined,
      githubUrl: githubUrl.trim() || undefined,
      portfolioUrl: portfolioUrl.trim() || undefined,
      // Auto-run fields. Only persist the schedule when the toggle is on;
      // when off we still save the toggle so it sticks across sessions.
      autoRunEnabled,
      ...(autoRunEnabled && {
        alertFrequencyHours,
        alertStartHour,
        alertEndHour,
        alertTimezone,
      }),
    });
    if (res.ok) {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } else {
      setSaveState("error");
      setError(res.error ?? "Save failed");
    }
  }

  const exampleRoles = ROLE_KEYWORDS.slice(0, 4).join(", ");
  const exampleSkills = SKILL_KEYWORDS.slice(0, 5).join(", ");

  return (
    <form onSubmit={handleSave} className="space-y-8">
      <Field
        id="preferred-titles"
        label="Preferred titles"
        required
        hint="Comma-separated. A job's title must contain at least one of these."
        placeholder={`e.g. ${exampleRoles}`}
        defaultsNote="Required. Case-insensitive substring match."
        value={preferredTitles}
        onChange={setPreferredTitles}
      />

      <Field
        id="excluded-titles"
        label="Exclude titles"
        hint="Comma-separated. Any job whose title contains one of these is skipped."
        placeholder="e.g. java, staff, principal, lead, manager"
        defaultsNote="Optional. Empty = nothing excluded."
        value={excludedTitles}
        onChange={setExcludedTitles}
      />

      <Field
        id="skills"
        label="Skills"
        required
        hint="Comma-separated. Used to keyword-score each job before AI analysis."
        placeholder={`e.g. ${exampleSkills}`}
        defaultsNote="Required. At least one skill must match for a job to surface."
        value={skills}
        onChange={setSkills}
      />

      <div className="space-y-4 pt-2 border-t border-border">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Links
          </h3>
          <p className="text-xs text-muted-foreground">
            Public profile URLs. The deep-dive agent can reference these when
            drafting a cover letter, and you can copy them when applying.
          </p>
        </div>
        <Field
          id="linkedin-url"
          label="LinkedIn"
          hint="Your LinkedIn profile URL."
          placeholder="https://www.linkedin.com/in/your-handle"
          defaultsNote="Optional."
          value={linkedinUrl}
          onChange={setLinkedinUrl}
        />
        <Field
          id="github-url"
          label="GitHub"
          hint="Your GitHub profile URL."
          placeholder="https://github.com/your-handle"
          defaultsNote="Optional."
          value={githubUrl}
          onChange={setGithubUrl}
        />
        <Field
          id="portfolio-url"
          label="Website / portfolio"
          hint="Personal site, portfolio, or writing."
          placeholder="https://your-domain.com"
          defaultsNote="Optional."
          value={portfolioUrl}
          onChange={setPortfolioUrl}
        />
      </div>
      <div
        className={cn(
          "space-y-4 pt-2 border-t border-border",
          !isProUser && "opacity-70",
        )}
      >
        <div>
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Auto-run {!isProUser && "🔒"}
            </h3>
            {!isProUser && (
              <a
                href={upgradeHref}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Request upgrade →
              </a>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Run hunts on a schedule and email you when new jobs match. Auto-runs
            don&apos;t use AI scoring — they fetch + filter only, so cost is $0.
            Email alerts are throttled to your chosen window and pace.
            {!isProUser && (
              <span className="block mt-1 text-foreground/80">
                Auto-run is a Pro feature.
              </span>
            )}
          </p>
        </div>

        {/* Toggle */}
        <label
          className={cn(
            "flex items-center gap-2",
            isProUser ? "cursor-pointer" : "cursor-not-allowed",
          )}
        >
          <button
            type="button"
            role="switch"
            aria-checked={autoRunEnabled && isProUser}
            disabled={!isProUser}
            onClick={() => isProUser && setAutoRunEnabled(!autoRunEnabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              autoRunEnabled && isProUser
                ? "bg-emerald-500"
                : "bg-muted-foreground/30",
              !isProUser && "cursor-not-allowed",
            )}
          >
            <span
              className={cn(
                "inline-block size-5 transform rounded-full bg-background shadow transition-transform",
                autoRunEnabled ? "translate-x-5" : "translate-x-0.5",
              )}
            />
          </button>
          <span className="text-sm font-medium">Enable auto-run</span>
        </label>
        {autoRunEnabled && (
          <div className="space-y-4 pl-1">
            <div className="space-y-2">
              <Label htmlFor="alert-frequency">
                Alert frequency{" "}
                <span className="text-muted-foreground font-normal text-sm">
                  — how often to receive emails when new jobs appear
                </span>
              </Label>
              <select
                id="alert-frequency"
                value={alertFrequencyHours}
                onChange={(e) => setAlertFrequencyHours(Number(e.target.value))}
                disabled={!isProUser}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                {ALERT_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="alert-start">Start hour</Label>
                <select
                  id="alert-start"
                  value={alertStartHour}
                  onChange={(e) => setAlertStartHour(Number(e.target.value))}
                  disabled={!isProUser}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="alert-end">End hour</Label>
                <select
                  id="alert-end"
                  value={alertEndHour}
                  onChange={(e) => setAlertEndHour(Number(e.target.value))}
                  disabled={!isProUser}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="alert-tz">Timezone</Label>
              <select
                id="alert-tz"
                value={alertTimezone}
                onChange={(e) => setAlertTimezone(e.target.value)}
                disabled={!isProUser}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Start/end hours are interpreted in this timezone.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="search-window">
          Search window{" "}
          <span className="text-muted-foreground font-normal text-sm">
            — only show jobs posted within this window
          </span>
        </Label>
        <select
          id="search-window"
          value={maxAgeDays}
          onChange={(e) => setMaxAgeDays(Number(e.target.value))}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {SEARCH_WINDOWS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Shorter windows = fewer, fresher jobs = lower AI cost per run.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saveState === "saving"}>
          {saveState === "saving" ? "Saving…" : "Save preferences"}
        </Button>
        {saveState === "saved" && (
          <span className="text-sm text-emerald-400">✓ Saved</span>
        )}
        {saveState === "error" && (
          <span className="text-sm text-destructive">✗ {error}</span>
        )}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  placeholder,
  defaultsNote,
  value,
  onChange,
  required = false,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  defaultsNote: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}{" "}
        <span className="text-muted-foreground font-normal text-sm">
          — {hint}
        </span>
      </Label>
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className={cn("text-xs text-muted-foreground")}>{defaultsNote}</p>
    </div>
  );
}
