import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getCompaniesByAts,
  TOTAL_COMPANIES,
  ATS_COUNT,
  type CompanyEntry,
} from "@/lib/hunt/companies";
import type { Source } from "@/lib/hunt/types";

const ATS_LABEL: Record<Source, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
};

export default async function CompaniesPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const byAts = getCompaniesByAts();
  const indianCount = Object.values(byAts)
    .flat()
    .filter((c) => c.indianHq).length;

  return (
    <main className="flex-1">
      <header className="border-b border-border">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard">
              <h1 className="text-lg font-semibold">Hunterr</h1>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/dashboard"
                className="text-muted-foreground hover:text-foreground"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/resume"
                className="text-muted-foreground hover:text-foreground"
              >
                Resume
              </Link>
              <Link
                href="/dashboard/profile"
                className="text-muted-foreground hover:text-foreground"
              >
                Profile
              </Link>
              <Link
                href="/dashboard/companies"
                className="text-foreground font-medium"
              >
                Companies
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {session.user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <section className="container mx-auto px-6 py-10 max-w-4xl">
        <h2 className="text-3xl font-bold mb-2">Companies tracked</h2>
        <p className="text-muted-foreground mb-8">
          Hunterr scans <strong>{TOTAL_COMPANIES} companies</strong> across{" "}
          {ATS_COUNT} ATS platforms — all with active India hiring (
          {indianCount} are Indian-HQ). Each run pulls every open posting from
          these boards. Click any company to browse its full board directly.
        </p>

        <div className="space-y-8">
          {(Object.keys(byAts) as Source[]).map((ats) => (
            <div key={ats}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {ATS_LABEL[ats]}{" "}
                <span className="font-normal normal-case">
                  · {byAts[ats].length} companies
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {byAts[ats].map((c) => (
                  <CompanyChip key={c.slug} company={c} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-10 pt-6 border-t border-border">
          Missing a company you want tracked? They need a public Greenhouse,
          Lever, or Ashby board. Many Indian startups (Razorpay, Swiggy, Zomato)
          run their own career sites and aren&apos;t reachable this way yet.
        </p>
      </section>
    </main>
  );
}

function CompanyChip({ company }: { company: CompanyEntry }) {
  return (
    <a
      href={company.boardUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-2 rounded-lg border bg-muted/10 px-3 py-2 text-sm hover:bg-muted/30 transition-colors"
    >
      <span className="truncate">{company.label}</span>
      {company.indianHq && (
        <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          🇮🇳 HQ
        </span>
      )}
    </a>
  );
}
