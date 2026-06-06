import Link from "next/link";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

interface NavProps {
  userEmail: string;
}

export default function Nav({ userEmail }: NavProps) {
    return (
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard">
              <h1 className="text-lg font-semibold">Hunterr</h1>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/dashboard/jobs"
                className="text-muted-foreground hover:text-foreground"
              >
                Jobs
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
                className="text-muted-foreground hover:text-foreground"
              >
                Companies
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {userEmail}
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
    )
}