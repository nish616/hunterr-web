"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadResumeAction, type UploadState } from "./actions";

const initial: UploadState = { status: "idle" };

export function ResumeUploadForm() {
  const [state, formAction, pending] = useActionState(
    uploadResumeAction,
    initial,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="resume">
          Resume file <span className="text-muted-foreground">(.pdf, .docx, .txt, .md — max 5MB)</span>
        </Label>
        <input
          ref={fileRef}
          id="resume"
          name="resume"
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown"
          required
          className="block w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-muted file:text-foreground file:font-medium hover:file:bg-muted/70 file:cursor-pointer"
        />
      </div>

      {state.status === "error" && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p className="text-sm text-emerald-400" role="status">
          ✓ {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Profiling with Claude…" : "Upload & re-profile"}
      </Button>
      {pending && (
        <p className="text-xs text-muted-foreground">
          Extracting text and sending to Claude — takes ~10-20 seconds.
        </p>
      )}
    </form>
  );
}
