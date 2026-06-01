import { stripHtml } from "./html";
import type { Job, Source } from "./types";
import { ATS_CONFIG } from "./config";

const REQUEST_TIMEOUT_MS = 20_000;

const URLS = {
  greenhouse: (slug: string) =>
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
  lever: (slug: string) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
  ashby: (slug: string) =>
    `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=false`,
};

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function makeJob(partial: Partial<Job> & Pick<Job, "source" | "company">): Job {
  return {
    title: "",
    location: "",
    url: "",
    postedAt: "",
    description: "",
    keywordScore: 0,
    matchedSkills: [],
    ...partial,
  };
}

interface GreenhouseJob {
  title?: string;
  location?: { name?: string } | null;
  absolute_url?: string;
  updated_at?: string;
  content?: string;
}

interface LeverJob {
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: { location?: string; allLocations?: string[] };
  descriptionPlain?: string;
  description?: string;
  additionalPlain?: string;
  additional?: string;
  lists?: { content?: string }[];
}

interface AshbyJob {
  title?: string;
  locationName?: string;
  location?: string;
  jobUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
}

async function fetchGreenhouse(slug: string): Promise<Job[]> {
  const data = (await fetchJson(URLS.greenhouse(slug))) as
    | { jobs?: GreenhouseJob[] }
    | null;
  if (!data?.jobs) return [];
  return data.jobs.map((j) =>
    makeJob({
      source: "greenhouse",
      company: slug,
      title: j.title ?? "",
      location: j.location?.name ?? "",
      url: j.absolute_url ?? "",
      postedAt: j.updated_at ?? "",
      description: stripHtml(j.content ?? ""),
    }),
  );
}

async function fetchLever(slug: string): Promise<Job[]> {
  const data = (await fetchJson(URLS.lever(slug))) as LeverJob[] | null;
  if (!data) return [];
  return data.map((j) => {
    const cats = j.categories ?? {};
    const descParts = [
      j.descriptionPlain ?? stripHtml(j.description ?? ""),
      ...(j.lists ?? []).map((l) => stripHtml(l.content ?? "")),
      j.additionalPlain ?? stripHtml(j.additional ?? ""),
    ].filter(Boolean);

    let location = cats.location ?? "";
    if (!location && cats.allLocations?.length) location = cats.allLocations[0];

    const posted =
      typeof j.createdAt === "number"
        ? new Date(j.createdAt).toISOString()
        : "";

    return makeJob({
      source: "lever",
      company: slug,
      title: j.text ?? "",
      location,
      url: j.hostedUrl ?? j.applyUrl ?? "",
      postedAt: posted,
      description: descParts.join(" "),
    });
  });
}

async function fetchAshby(slug: string): Promise<Job[]> {
  const data = (await fetchJson(URLS.ashby(slug))) as
    | { jobs?: AshbyJob[]; postings?: AshbyJob[] }
    | null;
  const postings = data?.jobs ?? data?.postings ?? [];
  return postings.map((j) =>
    makeJob({
      source: "ashby",
      company: slug,
      title: j.title ?? "",
      location: j.locationName ?? j.location ?? "",
      url: j.jobUrl ?? j.applyUrl ?? "",
      postedAt: j.publishedAt ?? j.updatedAt ?? "",
      description: stripHtml(j.descriptionHtml ?? "") || j.descriptionPlain || "",
    }),
  );
}

const FETCHERS: Record<Source, (slug: string) => Promise<Job[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
};

export interface FetchAllResult {
  jobs: Job[];
  failures: { ats: string; slug: string; error: string }[];
}

export async function fetchAll(): Promise<FetchAllResult> {
  const tasks: { ats: Source; slug: string }[] = [];
  for (const [ats, slugs] of Object.entries(ATS_CONFIG)) {
    for (const slug of slugs) {
      tasks.push({ ats: ats as Source, slug });
    }
  }

  const results = await Promise.allSettled(
    tasks.map(async ({ ats, slug }) => ({
      ats,
      slug,
      jobs: await FETCHERS[ats](slug),
    })),
  );

  const jobs: Job[] = [];
  const failures: FetchAllResult["failures"] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      jobs.push(...r.value.jobs);
    } else {
      failures.push({
        ats: tasks[i].ats,
        slug: tasks[i].slug,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  return { jobs, failures };
}
