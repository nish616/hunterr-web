import Link from "next/link";
import { signOut } from "@/auth";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV_LINKS = [
  { href: "/dashboard/jobs", label: "Jobs" },
  { href: "/dashboard/resume", label: "Resume" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/companies", label: "Companies" },
] as const;

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
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
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
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            }
          />

          <SheetContent side="right" className="w-[280px] p-4">
            <SheetTitle className="sr-only">Navigation</SheetTitle>

            <div className="mt-6 flex flex-col gap-4">
              <p className="text-sm text-muted-foreground break-all">
                {userEmail}
              </p>

              <nav className="flex flex-col gap-3">
                {NAV_LINKS.map((l) => (
                  <SheetClose
                    key={l.href}
                    render={
                      <Link
                        href={l.href}
                        className="text-foreground hover:text-muted-foreground"
                      >
                        {l.label}
                      </Link>
                    }
                  />
                ))}
              </nav>

              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
                className="mt-4"
              >
                <Button variant="outline" type="submit" className="w-full">
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