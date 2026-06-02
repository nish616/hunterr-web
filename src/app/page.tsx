import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SHOTS: {
  src: string;
  alt: string;
  tag: string;
  caption: string;
  sub: string;
}[] = [
  {
    src: "/screenshots/results.png",
    alt: "Dashboard results, AI-scored job matches with verdict, strengths and gaps",
    tag: "Results",
    caption: "Ranked matches, scored against your resume",
    sub: "Every role gets a verdict, a 1-10 fit score, concrete strengths and gaps.",
  },
  {
    src: "/screenshots/progress.png",
    alt: "Live hunt progress, fetching, filtering and scoring stages",
    tag: "Live run",
    caption: "Watch the agent work, live",
    sub: "Each stage streams as it happens, including scoring N of 30.",
  },
  {
    src: "/screenshots/profile.png",
    alt: "Profile and preferences, titles, skills and search window",
    tag: "Profile",
    caption: "Your titles, skills and search window",
    sub: "Per-user preferences drive what gets surfaced and how it is scored.",
  },
  {
    src: "/screenshots/companies.png",
    alt: "Companies tracked, 85 companies across three ATS platforms",
    tag: "Companies",
    caption: "85 companies tracked",
    sub: "Across Greenhouse, Lever and Ashby, tagged by ATS and India-HQ.",
  },
  {
    src: "/screenshots/resume.png",
    alt: "Resume page, AI-parsed candidate profile",
    tag: "Resume",
    caption: "Your resume, parsed into a profile",
    sub: "Claude reads your resume into a structured profile used for scoring.",
  },
];

const TECH = [
  "Next.js 16",
  "TypeScript",
  "Tailwind v4",
  "shadcn/ui",
  "Claude Sonnet 4.6",
  "Anthropic SDK",
  "Postgres",
  "Drizzle ORM",
];

export default function LandingPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="container mx-auto px-6 pt-24 pb-16 md:pt-32 md:pb-20 max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 text-xs font-medium rounded-full border bg-muted/40 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Private alpha — invite only
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          Hunterr
        </h1>
        <p className="text-lg md:text-2xl text-muted-foreground mb-10 leading-relaxed">
          An AI job-discovery agent. Scans 85 company job boards, ranks roles
          against your résumé with Claude.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" nativeButton={false} render={<Link href="/signin" />}>
            Sign in
          </Button>
          <Button
            variant="outline"
            size="lg"
            nativeButton={false}
            render={<Link href="#how-it-works" />}
          >
            See how it works
          </Button>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="container mx-auto px-6 py-20 max-w-5xl"
      >
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">
          How it works
        </h2>
        <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
          A three-stage pipeline. Cheap upstream filtering keeps the expensive
          AI step focused on jobs worth analyzing.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Step 01
              </div>
              <CardTitle>Crawl</CardTitle>
              <CardDescription className="pt-2">
                Pulls every posting from Greenhouse, Lever, and Ashby — covers
                85 companies with active India hiring.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              ~9,000 postings fetched in parallel in seconds — no scraping, no
              auth.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Step 02
              </div>
              <CardTitle>Filter</CardTitle>
              <CardDescription className="pt-2">
                Role keywords, location, posted-age, skill match. Geofenced
                US/CA remote roles auto-rejected.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              5,000 postings narrow to ~30 worth analyzing — saves AI cost on
              roles you&apos;d never apply to.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Step 03
              </div>
              <CardTitle>Score with Claude</CardTitle>
              <CardDescription className="pt-2">
                Each surviving JD goes to Claude Sonnet 4.6 with your resume.
                Structured fit analysis: score 1–10, verdict, strengths, gaps.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Resume prompt-cached so 30 jobs cost ~$0.10. Verdicts ranked
              strong → stretch → skip.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Product showcase */}
      <section className="container mx-auto px-6 py-20 max-w-4xl">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-16">
          See it in action
        </h2>

        {/* Single column. Centered caption above an app-window framed shot. */}
        <div className="space-y-24">
          {SHOTS.map((shot, i) => (
            <figure key={shot.src} className="flex flex-col items-center">
              <figcaption className="text-center max-w-xl mb-6">
                <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
                  {String(i + 1).padStart(2, "0")} &middot; {shot.tag}
                </div>
                <h3 className="text-2xl md:text-3xl font-semibold tracking-tight">
                  {shot.caption}
                </h3>
                <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">
                  {shot.sub}
                </p>
              </figcaption>

              {/* App-window frame */}
              <div className="w-full rounded-xl border border-border bg-card overflow-hidden shadow-2xl shadow-black/50">
                <div className="flex items-center gap-2 h-9 px-4 border-b border-border bg-muted/30">
                  <span className="size-2.5 rounded-full bg-red-500/60" />
                  <span className="size-2.5 rounded-full bg-yellow-500/60" />
                  <span className="size-2.5 rounded-full bg-green-500/60" />
                </div>
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  width={2000}
                  height={1100}
                  className="w-full h-auto"
                  priority={i === 0}
                />
              </div>
            </figure>
          ))}
        </div>
      </section>

      {/* Tech stack */}
      <section className="container mx-auto px-6 py-16 max-w-3xl text-center">
        <h2 className="text-2xl font-bold mb-2">Built with</h2>
        <p className="text-sm text-muted-foreground mb-6">
          A modern, deployable stack.
        </p>
        <div className="flex flex-wrap justify-center gap-2 text-sm">
          {TECH.map((tech) => (
            <span
              key={tech}
              className="px-3 py-1 rounded-md border bg-muted/30 text-muted-foreground"
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-6 py-10 mt-12 border-t border-border text-center text-sm text-muted-foreground">
        Built by Nishin S · {new Date().getFullYear()}
      </footer>
    </main>
  );
}
