import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Subscription, UserPreferences } from "@/lib/db/schema";
import { DEFAULT_SUBSCRIPTION } from "@/lib/db/schema";
import { ProfileForm } from "./profile-form";
import { Nav } from "@/components/ui/nav";


export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    columns: { preferences: true, subscription: true },
  });
  const preferences: UserPreferences = row?.preferences ?? {};
  const subscription: Subscription = row?.subscription ?? DEFAULT_SUBSCRIPTION;

  return (
    <main className="flex-1">
      <header className="border-b border-border">
        <Nav userEmail={session.user.email ?? ""} />
      </header>

      <section className="container mx-auto px-6 py-10 max-w-2xl">
        <h2 className="text-3xl font-bold mb-2">Profile &amp; Preferences</h2>
        <p className="text-muted-foreground mb-8">
          These preferences control which jobs are surfaced and how they&apos;re
          scored. Leave a field empty to fall back to the built-in defaults.
        </p>

        <ProfileForm
          preferences={preferences}
          subscription={subscription}
          userEmail={session.user.email ?? ""}
        />
      </section>
    </main>
  );
}
