import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Subscription } from "@/lib/db/schema";
import { DEFAULT_SUBSCRIPTION } from "@/lib/db/schema";
import { JobsClient } from "./jobs-client";
import { Nav } from "@/components/ui/nav";

export default async function JobsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    columns: { subscription: true },
  });
  const subscription: Subscription = row?.subscription ?? DEFAULT_SUBSCRIPTION;

  return (
    <main className="flex-1">
      <header className="border-b border-border">
        <Nav userEmail={session.user.email ?? ""} />
      </header>

      <JobsClient
        subscription={subscription}
        userEmail={session.user.email ?? ""}
      />
    </main>
  );
}
