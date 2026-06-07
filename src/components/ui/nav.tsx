import Link from "next/link";
import { signOut } from "@/auth";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Nav({ userEmail }: { userEmail: string }) {
  return (
    <div className="container mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
      {/* Left side */}
      <div className="flex items-center gap-6">
        <Link href="/dashboard">
          <h1 className="text-lg font-semibold">Hunterr</h1>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4 text-sm">
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

      {/* Desktop user section */}
      <div className="hidden md:flex items-center gap-3">
        <span className="text-sm text-muted-foreground truncate max-w-[200px]">
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

      {/* Mobile menu */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>

          <SheetContent side="right" className="w-[280px]">
            <div className="mt-6 flex flex-col gap-4">
              <p className="text-sm text-muted-foreground break-all">
                {userEmail}
              </p>

              <nav className="flex flex-col gap-3">
                <Link href="/dashboard/jobs">Jobs</Link>
                <Link href="/dashboard/resume">Resume</Link>
                <Link href="/dashboard/profile">Profile</Link>
                <Link href="/dashboard/companies">Companies</Link>
              </nav>

              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
                className="mt-4"
              >
                <Button
                  variant="outline"
                  type="submit"
                  className="w-full"
                >
                  Sign out
                </Button>
              </form>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}