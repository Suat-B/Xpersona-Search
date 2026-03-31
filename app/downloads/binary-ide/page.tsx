import Link from "next/link";
import { loadBinaryDesktopReleaseManifests } from "@/lib/binary-desktop/releases";

export const metadata = {
  title: "Binary IDE Downloads",
  description: "Download Binary IDE desktop builds for Windows, macOS, and Linux across stable, beta, and internal channels.",
};

const channelCopy: Record<string, string> = {
  stable: "Production-ready installers and update manifests for the default user path.",
  beta: "Early-access builds for faster product feedback while keeping the same host/runtime contract.",
  internal: "Signed internal dogfood releases for the team debugging the next Binary IDE desktop milestone.",
};

export default async function BinaryIdeDownloadsPage() {
  const manifests = await loadBinaryDesktopReleaseManifests();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16 text-[var(--text-primary)]">
      <section className="rounded-[32px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(35,197,154,0.14),rgba(59,130,246,0.18))] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.16)]">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--accent)]">Binary IDE Desktop</p>
        <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Download the main Binary IDE app</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--text-secondary)]">
          The desktop app is the primary entry point for Binary IDE. It talks to the local Binary Host service, keeps hosted orchestration intact, and shares the same runtime contract as the CLI.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--text-secondary)]">
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2">Windows installer</span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2">macOS signed DMG</span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2">Linux AppImage</span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2">Auto-update channels</span>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {manifests.map((manifest) => (
          <article
            key={manifest.channel}
            id={manifest.channel}
            className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.12)]"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold capitalize">{manifest.channel}</h2>
              <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                {manifest.version}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{channelCopy[manifest.channel]}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Released {new Date(manifest.releasedAt).toLocaleDateString()}
            </p>

            <div className="mt-6 grid gap-3">
              <Link className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 font-medium hover:border-[var(--accent)]" href={manifest.downloads.windows}>
                Download for Windows
              </Link>
              <Link className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 font-medium hover:border-[var(--accent)]" href={manifest.downloads.macos}>
                Download for macOS
              </Link>
              <Link className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 font-medium hover:border-[var(--accent)]" href={manifest.downloads.linux}>
                Download for Linux
              </Link>
            </div>

            <div className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-secondary)]">
              <p>Checksums</p>
              <p className="mt-2">Windows: {manifest.checksums.windows}</p>
              <p>macOS: {manifest.checksums.macos}</p>
              <p>Linux: {manifest.checksums.linux}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <h2 className="text-2xl font-semibold">Release model</h2>
        <div className="mt-4 grid gap-4 text-sm leading-7 text-[var(--text-secondary)] md:grid-cols-2">
          <p>Auto-update metadata should be published to your download origin, not embedded in the website. The website stays the discovery surface and release-notes home.</p>
          <p>Binary IDE desktop, Binary Host, and CLI should all emit the same trace IDs and run IDs so support bundles can be correlated across local and hosted systems.</p>
        </div>
      </section>
    </main>
  );
}
