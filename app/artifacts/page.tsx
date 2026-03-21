import type { Metadata } from "next";
import fs from "node:fs/promises";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

const artifactLanes = [
  {
    title: "Portable bundles",
    description:
      "Generated starter bundles, manifests, and downloadable outputs produced from Playground and IDE workflows.",
    href: "/playground",
    cta: "Open Playground",
  },
  {
    title: "Receipts and run outputs",
    description:
      "Trust receipts, checkpoints, review state, and orchestration traces that explain what a run produced and why.",
    href: "/api",
    cta: "Browse API surface",
  },
  {
    title: "Artifact-aware discovery",
    description:
      "Search and compare generated assets alongside agents, skills, and capability metadata across the platform.",
    href: "/search",
    cta: "Search Xpersona",
  },
] as const;

const artifactSignals = [
  "Build artifacts are generated outputs, not hand-authored source files.",
  "Receipts and checkpoints make agent work easier to inspect and safer to recover.",
  "Manifests, previews, and logs help explain what the system actually produced.",
  "Artifacts become more useful when they stay linked to the run, model, and workspace context that created them.",
] as const;

const gemVariants = [
  "/gem.svg",
  "/gem-amber.svg",
  "/gem-rose.svg",
  "/gem-violet.svg",
  "/gem-crimson.svg",
  "/gem-lime.svg",
  "/gem-cobalt.svg",
  "/gem-pearl.svg",
  "/gem-sunset.svg",
] as const;

type BinaryArtifactRecord = {
  id: string;
  intent?: string | null;
  artifactKind?: string | null;
  status?: string | null;
  phase?: string | null;
  progress?: number | null;
  targetEnvironment?: {
    runtime?: string | null;
    platform?: string | null;
  } | null;
  reliability?: {
    score?: number | null;
    summary?: string | null;
  } | null;
  artifact?: {
    fileName?: string | null;
    relativePath?: string | null;
    sizeBytes?: number | null;
  } | null;
  errorMessage?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type RecentArtifactCard = {
  id: string;
  title: string;
  kind: string;
  status: string;
  progress: number;
  runtime: string;
  platform: string;
  reliabilityScore: number | null;
  summary: string;
  updatedLabel: string;
  gemSrc: string;
};

function formatArtifactTime(value: string | null | undefined): string {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatArtifactKind(value: string | null | undefined): string {
  if (!value) return "artifact";
  return value.replace(/_/g, " ");
}

function summarizeArtifact(record: BinaryArtifactRecord): string {
  if (record.artifact?.fileName) {
    return `Ready to download as ${record.artifact.fileName}.`;
  }
  if (record.errorMessage) {
    return `Latest issue: ${record.errorMessage}.`;
  }
  if (record.reliability?.summary) {
    return record.reliability.summary;
  }
  return "Generated output available for inspection.";
}

async function readRecentArtifacts(): Promise<RecentArtifactCard[]> {
  const root = path.join(process.cwd(), "artifacts", "binary-builds");
  let entries: Array<{ name: string; isDirectory(): boolean }> = [];
  try {
    const dirEntries = await fs.readdir(root, { withFileTypes: true });
    entries = dirEntries.map((entry) => ({
      name: String(entry.name),
      isDirectory: () => entry.isDirectory(),
    }));
  } catch {
    return [];
  }

  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const recordPath = path.join(root, entry.name, "record.json");
        try {
          const raw = await fs.readFile(recordPath, "utf8");
          const parsed = JSON.parse(raw) as BinaryArtifactRecord;
          return parsed;
        } catch {
          return null;
        }
      })
  );

  return records
    .filter((record): record is BinaryArtifactRecord => Boolean(record?.id))
    .sort((a, b) => {
      const left = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const right = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return right - left;
    })
    .slice(0, 9)
    .map((record, index) => ({
      id: record.id,
      title: record.intent?.trim() || record.id,
      kind: formatArtifactKind(record.artifactKind),
      status: record.status || record.phase || "unknown",
      progress: Number.isFinite(record.progress) ? Number(record.progress) : 0,
      runtime: record.targetEnvironment?.runtime || "unknown runtime",
      platform: record.targetEnvironment?.platform || "unknown platform",
      reliabilityScore:
        typeof record.reliability?.score === "number" ? Math.round(record.reliability.score) : null,
      summary: summarizeArtifact(record),
      updatedLabel: formatArtifactTime(record.updatedAt || record.createdAt),
      gemSrc: gemVariants[index % gemVariants.length],
    }));
}

export const metadata: Metadata = {
  title: "Artifacts | Xpersona",
  description:
    "Explore generated artifacts across Xpersona, including portable bundles, receipts, checkpoints, manifests, and build outputs.",
  alternates: { canonical: `${baseUrl}/artifacts` },
  robots: { index: true, follow: true },
};

export default async function ArtifactsPage() {
  const recentArtifacts = await readRecentArtifacts();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Artifacts</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Generated outputs with context</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
          Artifacts are the outputs your agents and build flows create: portable bundles, manifests, logs, receipts,
          checkpoints, and other run-linked deliverables. This page gives them a home in the main site navigation and a
          clearer explanation for users moving between search, Playground, and IDE workflows.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            href="/playground"
            className="rounded-full bg-[var(--accent-heart)] px-4 py-2 font-medium text-white hover:opacity-90"
          >
            Create artifacts
          </Link>
          <Link
            href="/search"
            className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Search related assets
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-6">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Recent user artifacts</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Latest generated outputs pulled from the local artifact store, each paired with a gem variant for quick
                visual scanning.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              {recentArtifacts.length} recent items
            </span>
          </div>

          {recentArtifacts.length > 0 ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recentArtifacts.map((artifact) => (
                <article
                  key={artifact.id}
                  className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 transition-colors hover:border-[var(--accent-heart)]/40"
                >
                  <div className="flex items-start gap-4">
                    <Image
                      src={artifact.gemSrc}
                      alt=""
                      width={64}
                      height={64}
                      className="h-16 w-16 flex-none rounded-2xl border border-white/10 bg-black/10 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                        <span>{artifact.kind}</span>
                        <span className="rounded-full border border-[var(--border)] px-2 py-0.5">
                          {artifact.status}
                        </span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-base font-semibold text-[var(--text-primary)]">
                        {artifact.title}
                      </h3>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">{artifact.summary}</p>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Runtime</p>
                      <p className="mt-1 font-medium text-[var(--text-primary)]">
                        {artifact.runtime} / {artifact.platform}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Reliability</p>
                      <p className="mt-1 font-medium text-[var(--text-primary)]">
                        {artifact.reliabilityScore != null ? `${artifact.reliabilityScore}/100` : "--"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-black/10">
                      <div
                        className="h-full rounded-full bg-[var(--accent-heart)] transition-[width]"
                        style={{ width: `${Math.max(0, Math.min(100, artifact.progress))}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                      <span>{artifact.progress}% complete</span>
                      <span>{artifact.updatedLabel}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-sm text-[var(--text-secondary)]">
              No local artifact records were found yet. Generate a portable bundle and this grid will start filling in.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">What counts as an artifact</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            In Xpersona, artifacts are machine-produced outputs that help a user inspect, ship, or recover work. That
            includes generated files, downloadable extension bundles, manifests, build logs, trust receipts, and
            orchestration metadata that document what happened during a run.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {artifactSignals.map((item) => (
              <div
                key={item}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-secondary)]"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Artifact lanes</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Different parts of the product create different artifact types. Use the lanes below to jump into the flow
            that matches what you want to produce or inspect.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {artifactLanes.map((lane) => (
              <Link
                key={lane.title}
                href={lane.href}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 transition-colors hover:border-[var(--accent-heart)]/40"
              >
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{lane.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{lane.description}</p>
                <span className="mt-4 inline-flex text-sm font-medium text-[var(--accent-heart)]">{lane.cta}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Why this page exists</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            The header now includes an Artifacts tab so generated outputs have a first-class destination instead of
            being implied across other pages. That gives users a cleaner mental model: source code is authored, while
            artifacts are produced, inspected, downloaded, and verified.
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Gem badge library</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Nine gem variants are available for artifact cards, rarity badges, or future inventory-style UI.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {gemVariants.map((gemSrc) => (
              <div
                key={gemSrc}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-center"
              >
                <Image
                  src={gemSrc}
                  alt=""
                  width={96}
                  height={96}
                  className="mx-auto h-24 w-24 rounded-2xl object-cover"
                />
                <p className="mt-3 text-xs text-[var(--text-tertiary)]">{gemSrc.replace("/", "")}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
