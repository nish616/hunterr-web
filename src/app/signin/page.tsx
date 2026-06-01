import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-3xl font-bold tracking-tight">Hunterr</h1>
          </Link>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in to continue
          </p>
        </div>

        <SignInForm />

        <div className="mt-8 pt-6 border-t border-border text-center text-sm text-muted-foreground space-y-1">
          <p>🔒 Hunterr is invite-only.</p>
          <p>
            Don&apos;t have an account?{" "}
            <a
              href="mailto:nishin@example.com"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Reach out
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
