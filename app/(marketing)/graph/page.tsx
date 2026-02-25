import { readFile } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";
import { SkillMarkdown } from "@/components/agent/SkillMarkdown";
import { GraphExplorer } from "@/components/graph/GraphExplorer";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // Ignore auth errors for public page rendering.
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isAuthenticated = !!(session?.user || userIdFromCookie);

  const filePath = path.join(process.cwd(), "XPERSONA-GRAPH.md");
  const content = await readFile(filePath, "utf-8");

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-deep)]">
      <ANSMinimalHeader isAuthenticated={isAuthenticated} variant="dark" />

      <main className="flex-1">
        <GraphExplorer />
        <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
          <div className="rounded-3xl border border-white/[0.08] bg-black/40 p-6 sm:p-10 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-3">
              <div className="inline-flex items-center rounded-full border border-white/[0.12] bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                Blueprint
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
                Xpersona GPG Specification
              </h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-3xl">
                Full implementation blueprint, phased roadmap, and test criteria.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-white/[0.08] bg-black/30 p-5 sm:p-8">
              <SkillMarkdown content={content} />
            </div>
          </div>
        </section>
      </main>

      <ANSMinimalFooter variant="dark" />
    </div>
  );
}