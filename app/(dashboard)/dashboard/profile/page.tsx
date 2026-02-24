"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { ProfileStatsCard } from "@/components/dashboard/ProfileStatsCard";

type UserData = {
  id: string;
  email: string | null;
  name: string | null;
  image?: string | null;
};

interface ClaimedAgent {
  id: string;
  name: string;
  slug: string;
  source: string;
  claimedAt: string | null;
}

function ProfilePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserData | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [claimedAgents, setClaimedAgents] = useState<ClaimedAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [userRes, claimsRes] = await Promise.all([
        fetch("/api/v1/me", { credentials: "include" }),
        fetch("/api/v1/me/claimed-agents", { credentials: "include" }),
      ]);
      const userData = await userRes.json().catch(() => ({}));
      const claimsData = await claimsRes.json().catch(() => ({}));
      if (userData.success && userData.data) {
        setUser({
          id: userData.data.id,
          email: userData.data.email ?? null,
          name: userData.data.name ?? null,
          image: userData.data.image ?? null,
        });
      }
      setMemberSince(userData?.data?.createdAt ?? null);
      setClaimedAgents(claimsData.agents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const linkGuest = searchParams?.get("link_guest");
    if (linkGuest !== "1") return;
    fetch("/api/v1/auth/link-guest", { method: "POST", credentials: "include" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (data.success) router.replace("/dashboard/profile");
      })
      .catch(() => {});
  }, [searchParams, router]);

  useEffect(() => {
    const linkAgent = searchParams?.get("link_agent");
    if (linkAgent !== "1") return;
    fetch("/api/v1/auth/link-agent", { method: "POST", credentials: "include" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (data.success) router.replace("/dashboard/profile");
      })
      .catch(() => {});
  }, [searchParams, router]);

  const isAnonymous = user?.email?.endsWith?.("@xpersona.guest") || user?.email?.endsWith?.("@xpersona.human");
  const displayLabel = isAnonymous
    ? (user?.name ?? user?.email ?? "Guest")
    : (user?.name ?? user?.email ?? "You");

  const formatDate = (s: string | null) => {
    if (!s) return "\u2014";
    try {
      return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return "\u2014";
    }
  };

  const accountType = isAnonymous ? "Guest" : "Signed in";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)] text-[var(--text-primary)] tracking-tight">
          Profile
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Your account and developer information
        </p>
      </header>

      {loading ? (
        <div className="space-y-6">
          <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Profile header */}
          <GlassCard className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white/10">
                {user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt=""
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-secondary)]">
                    {user?.name?.[0] ?? user?.email?.[0] ?? "?"}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                  {displayLabel}
                </h2>
                <p className="text-sm text-[var(--text-secondary)] truncate">
                  {user?.email ?? "\u2014"}
                </p>
                {memberSince && (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Member since {formatDate(memberSince)}
                  </p>
                )}
                {isAnonymous && (
                  <Link
                    href="/auth/signin?callbackUrl=/dashboard/profile"
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--accent-heart)]/50 bg-[var(--accent-heart)]/10 px-4 py-2 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
                  >
                    Sign in to claim agents
                  </Link>
                )}
              </div>
            </div>
          </GlassCard>

          {/* Overview stats */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
              Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <ProfileStatsCard
                label="Account Type"
                value={accountType}
              />
              <ProfileStatsCard
                label="Claimed Agents"
                value={String(claimedAgents.length)}
              />
              <ProfileStatsCard
                label="Member Since"
                value={formatDate(memberSince)}
              />
            </div>
          </section>

          {/* Claimed agents */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Claimed Agent Pages
              </h2>
              <Link
                href="/dashboard/claimed-agents"
                className="text-sm text-[var(--accent-heart)] hover:text-[var(--accent-heart)]/80 transition-colors"
              >
                View all &rarr;
              </Link>
            </div>
            {claimedAgents.length > 0 ? (
              <div className="space-y-2">
                {claimedAgents.slice(0, 5).map((agent) => (
                  <div
                    key={agent.id}
                    className="agent-card p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/agent/${agent.slug}`}
                        className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent-heart)] transition-colors truncate block"
                      >
                        {agent.name}
                      </Link>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--text-quaternary)]">
                        <span>{agent.source}</span>
                        {agent.claimedAt && (
                          <span>Claimed {formatDate(agent.claimedAt)}</span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/agent/${agent.slug}/manage`}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors shrink-0"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Manage
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <GlassCard className="p-6 text-center">
                <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20 text-[var(--accent-heart)] mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  No claimed pages yet. Search for your project and claim it.
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-heart)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search Agents
                </Link>
              </GlassCard>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="h-8 w-48 rounded bg-white/10 animate-pulse" />
          <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <ProfilePageClient />
    </Suspense>
  );
}



