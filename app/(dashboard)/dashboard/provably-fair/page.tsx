"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";

export default function ProvablyFairPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
              Provably Fair
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Every roll is verifiable. This casino is fair by design.
            </p>
          </div>
        </div>
      </section>

      {/* For players & AI */}
      <GlassCard className="p-6 border-emerald-500/10">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          For players and AI
        </h2>
        <p className="text-[var(--text-primary)]">
          Every dice round is stored with a unique bet id, timestamp, and a linked server seed. You can verify that the result was derived fairly using the commitment (server seed hash) and, after the bet, the revealed server seed. The same guarantees apply to bets placed by OpenClaw agents and strategy runs.
        </p>
      </GlassCard>

      {/* How it works */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          How it works
        </h2>
        <ol className="space-y-4 list-none">
          <li className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] font-mono text-sm font-bold">1</span>
            <div>
              <strong className="text-[var(--text-primary)]">Before the bet</strong>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                The house commits to a secret server seed by storing and exposing only its hash: <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">serverSeedHash = SHA256(serverSeed)</code>. You see this hash (and client seed and nonce) so the outcome cannot be changed after the fact.
              </p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] font-mono text-sm font-bold">2</span>
            <div>
              <strong className="text-[var(--text-primary)]">The roll</strong>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                The result is computed deterministically from <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">serverSeed</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">clientSeed</code>, and <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">nonce</code> using the formula below.
              </p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] font-mono text-sm font-bold">3</span>
            <div>
              <strong className="text-[var(--text-primary)]">After the bet</strong>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                You can reveal the server seed for any of your dice bets and verify locally that (a) <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono">SHA256(serverSeed)</code> matches the committed hash, and (b) the formula yields the same result.
              </p>
            </div>
          </li>
        </ol>
      </GlassCard>

      {/* Verification formula */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Dice verification formula
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          The dice value (a number in [0, 100)) is computed as follows:
        </p>
        <ul className="text-sm text-[var(--text-secondary)] space-y-1 list-disc list-inside mb-4">
          <li>Concatenate: <code className="bg-white/10 px-1 rounded font-mono text-xs">serverSeed + clientSeed + &quot;:&quot; + nonce</code></li>
          <li>SHA-256 hash of that string (hex encoding)</li>
          <li>First 8 hex characters → integer → divide by 2<sup>32</sup> → multiply by 100</li>
        </ul>
        <pre className="rounded-lg bg-[var(--bg-deep)] border border-[var(--border)] p-4 text-xs font-mono text-[var(--text-primary)] overflow-x-auto">
{`value = (parseInt(SHA256(serverSeed + clientSeed + ":" + nonce).slice(0, 8), 16) / 0x100000000) * 100`}
        </pre>
      </GlassCard>

      {/* Verify your bets */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Verify your bets
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          On the dice game page, open the <strong className="text-[var(--text-primary)]">Stats</strong> tab and use the <strong className="text-[var(--text-primary)]">Verifiable history</strong> section. Click <strong className="text-[var(--accent-heart)]">Verify</strong> on any bet to see server seed hash, client seed, nonce, and the formula. You can reveal the server seed to run the calculation yourself.
        </p>
        <Link
          href="/games/dice"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-4 py-2 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
        >
          Open Dice
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </GlassCard>

      {/* For developers & AI */}
      <GlassCard className="p-6 border-[var(--accent-heart)]/10">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="rounded bg-[var(--accent-heart)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-heart)]">API</span>
          For developers and AI
        </h2>
        <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
          <li>
            <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">GET /api/me/bets?gameType=dice</code> — List recent dice bets with verification data (serverSeedHash, clientSeed, nonce, resultPayload).
          </li>
          <li>
            <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">GET /api/me/bets/[id]</code> — Fetch a single bet with full verification. Use <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">?reveal=1</code> to include the server seed.
          </li>
        </ul>
      </GlassCard>

      {/* Audit trail */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Audit trail
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          All dice plays — manual rolls from the web app, strategy runs, and OpenClaw agent bets — use the same execution path: a server seed is created, stored in <code className="bg-white/10 px-1 rounded font-mono text-xs">server_seeds</code>, and linked from <code className="bg-white/10 px-1 rounded font-mono text-xs">game_bets</code> via <code className="bg-white/10 px-1 rounded font-mono text-xs">server_seed_id</code>. There are no unlinked dice bets; every round is part of the same provably fair audit trail.
        </p>
      </GlassCard>
    </div>
  );
}
