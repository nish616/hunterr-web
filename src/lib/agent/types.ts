import type { DeepDiveSectionKind } from "@/lib/db/schema";

/**
 * Streaming events from the deep-dive agent. One JSON object per line (NDJSON),
 * matching the pattern in src/app/api/runs/route.ts so the client uses the same
 * line-delimited reader for both surfaces.
 */
export type DeepDiveEvent =
  | { type: "started"; id: string }
  | { type: "iteration"; n: number }
  | { type: "tool_use"; name: ToolName; input: Record<string, unknown> }
  | { type: "tool_result"; name: ToolName; ok: boolean; preview: string }
  | { type: "section_saved"; kind: DeepDiveSectionKind; content: string }
  | { type: "done"; sectionsSaved: number }
  | { type: "error"; message: string };

export type DeepDiveEventCallback = (event: DeepDiveEvent) => void;

export type ToolName = "fetch_url" | "save_finding";

export const SECTION_LABELS: Record<DeepDiveSectionKind, string> = {
  company_brief: "Company brief",
  tech_stack_reality_check: "Tech stack reality check",
  deep_gap_analysis: "Deep gap analysis",
  cover_letter: "Tailored cover letter",
  resume_rewrites: "Resume bullet rewrites",
};

export const SECTION_ORDER: DeepDiveSectionKind[] = [
  "company_brief",
  "tech_stack_reality_check",
  "deep_gap_analysis",
  "cover_letter",
  "resume_rewrites",
];
