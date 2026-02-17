"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";

type UserData = {
  id: string;
  email: string | null;
  name: string | null;
  image?: string | null;
  accountType?: string | null;
  isPermanent?: boolean;
};

function SettingsPageClient() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then(async (r) => {
        const text = await r.text();
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })
      .then((data) => {
        if (data.success && data.data) {
          setUser({
            id: data.data.id,
            email: data.data.email ?? null,
            name: data.data.name ?? null,
            image: data.data.image ?? null,
            accountType: data.data.accountType ?? null,
            isPermanent: data.data.isPermanent ?? false,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const isEphemeral = !user?.isPermanent && (user?.accountType === "agent" || user?.accountType === "human");
  const linkHref = user?.accountType === "agent" ? "/auth/signup?link=agent" : "/auth/signup?link=guest";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero */}
      <section>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Profile, API key, and account
        </p>
      </section>

      {/* Profile */}
      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Profile
        </h2>
        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : user ? (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Name
              </p>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {user.name || "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Email
              </p>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {user.email || "—"}
              </p>
            </div>
            {isEphemeral && (
              <div className="space-y-2">
                <p className="text-xs text-amber-400">
                  {user?.accountType === "agent"
                    ? "You're using a temporary play account. Create a permanent account to keep your API key and credits."
                    : "You're using a guest account. Create a permanent account to save your progress."}
                </p>
                <Link
                  href={linkHref}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent-heart)]/50 bg-[var(--accent-heart)]/10 px-4 py-2 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
                >
                  Create permanent account
                </Link>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            Unable to load profile.
          </p>
        )}
      </GlassCard>

      {/* API Key */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          API Key
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          For OpenClaw and AI. Generate and copy your key — you&apos;ll only
          see it once.
        </p>
        <ApiKeySection />
        <Link
          href="/dashboard/api"
          className="inline-block text-xs font-medium text-[var(--accent-heart)] hover:underline"
        >
          Full API docs →
        </Link>
      </div>

      {/* Sign out — unified route clears guest, agent, and NextAuth */}
      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Account
        </h2>
        <Link
          href="/api/signout"
          className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
        >
          Sign out
        </Link>
      </GlassCard>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="h-8 w-48 rounded bg-white/10" />
          <div className="h-32 rounded-xl bg-white/5" />
          <div className="h-24 rounded-xl bg-white/5" />
        </div>
      }
    >
      <SettingsPageClient />
    </Suspense>
  );
}
