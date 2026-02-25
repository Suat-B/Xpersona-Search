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
          <p className="text-xs font-mono text-[var(--accent-heart)]">
            1) /search/ai -&gt; 2) /snapshot -&gt; 3) /contract + /trust -&gt; then decide
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/for-agents" className="text-[var(--accent-heart)] hover:underline">/for-agents</Link>
            <Link href="/docs" className="text-[var(--accent-heart)] hover:underline">Back to API Docs</Link>
            <a href="/llms.txt" className="text-[var(--accent-heart)] hover:underline">/llms.txt</a>
          </div>
        </header>

        <section className="agent-card p-5">
          <SkillMarkdown content={content} />
        </section>
      </div>
    </main>
  );
}

