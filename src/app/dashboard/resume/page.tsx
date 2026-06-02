import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadCurrentProfile } from "@/lib/resume/profile";
import { ResumeUploadForm } from "./upload-form";

export default async function ResumePage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const { profileMd, resumeText, exists } = await loadCurrentProfile(
    session.user.id,
  );

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
              <Link href="/dashboard/resume" className="text-foreground font-medium">
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

      <section className="container mx-auto px-6 py-10 max-w-3xl">
        <h2 className="text-3xl font-bold mb-2">Resume</h2>
        <p className="text-muted-foreground mb-8">
          This resume is sent to Claude alongside every job description so it
          can judge fit. Update it whenever your experience changes.
        </p>

        <div className="rounded-xl border bg-muted/10 p-6 mb-10">
          <h3 className="font-semibold mb-4">Upload new resume</h3>
          <ResumeUploadForm />
        </div>

        {exists ? (
          <div>
            <h3 className="font-semibold mb-4">Current profile</h3>
            <div className="rounded-xl border bg-muted/10 p-6">
              <ProfileMarkdown md={profileMd} />
              <details className="mt-6 pt-6 border-t border-border">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  Raw resume text ({resumeText.length.toLocaleString()} chars)
                </summary>
                <pre className="mt-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
                  {resumeText}
                </pre>
              </details>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-muted/10 p-12 text-center text-muted-foreground">
            No resume yet. Upload one above to get started.
          </div>
        )}
      </section>
    </main>
  );
}

/**
 * Minimal Markdown renderer — handles headings, bullets, and paragraphs.
 * Avoids a heavyweight dep for what's a constrained profile format.
 */
function ProfileMarkdown({ md }: { md: string }) {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuf: string[] = [];
  let paraBuf: string[] = [];

  const flushList = () => {
    if (listBuf.length) {
      elements.push(
        <ul
          key={elements.length}
          className="list-disc pl-5 space-y-1 my-2 text-sm"
        >
          {listBuf.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>,
      );
      listBuf = [];
    }
  };
  const flushPara = () => {
    if (paraBuf.length) {
      elements.push(
        <p key={elements.length} className="text-sm my-2">
          {paraBuf.join(" ")}
        </p>,
      );
      paraBuf = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flushList();
      flushPara();
      elements.push(
        <h4
          key={elements.length}
          className="text-base font-semibold mt-5 mb-2 first:mt-0"
        >
          {line.replace(/^##\s*/, "")}
        </h4>,
      );
    } else if (line.startsWith("- ")) {
      flushPara();
      listBuf.push(line.replace(/^-\s*/, ""));
    } else if (line.trim() === "") {
      flushList();
      flushPara();
    } else {
      flushList();
      paraBuf.push(line);
    }
  }
  flushList();
  flushPara();

  return <div className="prose-sm">{elements}</div>;
}
