"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ROLE_KEYWORDS, SKILL_KEYWORDS } from "@/lib/hunt/config";
import type { UserPreferences } from "@/lib/db/schema";
import { savePreferencesAction } from "../actions";

type SaveState = "idle" | "saving" | "saved" | "error";

const DEFAULT_MAX_AGE_DAYS = 3;

const SEARCH_WINDOWS: { value: number; label: string }[] = [
  { value: 1, label: "Last 24 hours" },
  { value: 3, label: "Last 3 days" },
  { value: 7, label: "Last week" },
];

export function ProfileForm({
  preferences,
}: {
  preferences: UserPreferences;
}) {
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

    setSaveState("saving");

    const res = await savePreferencesAction({
      preferredTitles: preferredTitles.trim(),
      excludedTitles: excludedTitles.trim() || undefined,
      skills: skills.trim(),
      maxAgeDays,
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
