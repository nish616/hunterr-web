import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Subscription, UserPreferences } from "@/lib/db/schema";
import { DEFAULT_SUBSCRIPTION } from "@/lib/db/schema";
import { DashboardClient } from "./dashboard-client";
import { Nav } from "@/components/ui/nav";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  // Hydrate the client with the user's saved preferences and tier state.
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    columns: { preferences: true, subscription: true },
  });

  const initialPreferences: UserPreferences = row?.preferences ?? {};
  const subscription: Subscription = row?.subscription ?? DEFAULT_SUBSCRIPTION;

  return (
    <main className="flex-1">
      <header className="border-b border-border">
        <Nav userEmail={session.user.email ?? ""} />
      </header>

      <DashboardClient
        initialPreferences={initialPreferences}
        subscription={subscription}
        userEmail={session.user.email ?? ""}
      />
    </main>
  );
}
