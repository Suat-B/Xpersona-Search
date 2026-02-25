import { readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import { SkillMarkdown } from "@/components/agent/SkillMarkdown";

export const dynamic = "force-dynamic";

export default async function CapabilityContractsDocPage() {
  const filePath = path.join(process.cwd(), "docs", "CAPABILITY-CONTRACTS.md");
  const content = await readFile(filePath, "utf-8");

  return (
    <main className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Capability Contracts</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Machine-readable capability metadata for AI agents.
          </p>
          <Link href="/docs" className="text-sm text-[var(--accent-heart)] hover:underline">
            Back to API Docs
          </Link>
        </header>

        <section className="agent-card p-5">
          <SkillMarkdown content={content} />
        </section>
      </div>
    </main>
  );
}
