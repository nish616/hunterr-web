import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
          An AI job-discovery agent for engineers. Crawls 25+ ATS boards,
          ranks roles against your resume with Claude.
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
                25+ mid-size tech companies with India eng hubs.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              ~5,000 postings fetched in parallel in under 10 seconds, no
              scraping, no auth.
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

      {/* Dashboard preview placeholder */}
      <section className="container mx-auto px-6 py-16 max-w-5xl">
        <div className="rounded-xl border bg-muted/20 aspect-video flex items-center justify-center text-muted-foreground text-sm">
          Dashboard screenshot coming soon
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
