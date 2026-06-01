import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { UserPreferences } from "@/lib/db/schema";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    columns: { preferences: true },
  });
  const preferences: UserPreferences = row?.preferences ?? {};

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
                className="text-foreground font-medium"
              >
                Profile
              </Link>
              <Link
                href="/dashboard/companies"
                className="text-muted-foreground hover:text-foreground"
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

      <section className="container mx-auto px-6 py-10 max-w-2xl">
        <h2 className="text-3xl font-bold mb-2">Profile &amp; Preferences</h2>
        <p className="text-muted-foreground mb-8">
          These preferences control which jobs are surfaced and how they&apos;re
          scored. Leave a field empty to fall back to the built-in defaults.
        </p>

        <ProfileForm preferences={preferences} />
      </section>
    </main>
  );
}
