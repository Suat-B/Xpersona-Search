"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { unwrapClientResponse } from "@/lib/api/client-response";

type Tab =
  | "overview"
  | "users"
  | "claims"
  | "claimed_agents"
  | "agent_submissions"
  | "custom_pages"
  | "dashboard_access"
  | "llm_traffic";

type OverviewData = {
  usersTotal: number;
  usersLast7d: number;
  activeAgents: number;
  pendingAgents: number;
  pendingClaims: number;
  claimedAgents: number;
  customPagesPublished: number;
  customPagesDraft: number;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  accountType: string;
  createdAt: string | null;
};

type ClaimRow = {
  id: string;
  status: string;
  verificationMethod: string;
  createdAt: string;
  agentName: string | null;
  agentSlug: string | null;
  userEmail: string | null;
};

type AgentSubmissionRow = {
  id: string;
  name: string;
  slug: string;
  source: string;
  status: string;
  createdAt: string | null;
  claimedByUserEmail: string | null;
};

type CustomPageRow = {
  id: string;
  agentName: string;
  agentSlug: string;
  status: string;
  updatedAt: string | null;
};

type ClaimedAgentRow = {
  id: string;
  name: string;
  slug: string;
  source: string;
  sourceUrl: string;
  homepage: string | null;
  claimStatus: string;
  claimedAt: string | null;
  claimedByUserId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  verificationTier: string;
  verificationMethod: string | null;
  hasCustomPage: boolean;
  updatedAt: string | null;
};

type DashboardAccessRow = {
  id: string;
  path: string;
  outcome: string;
  userAgent: string;
  clientIp: string | null;
  referer: string | null;
  botLabel: string | null;
  createdAt: string | null;
};

type DashboardAccessSummary = {
  totalInWindow: number;
  sinceHours: number;
  pathPrefix: string;
  byPath: { path: string; count: number }[];
  byBotLabel: { botLabel: string; count: number }[];
  byOutcome: { outcome: string; count: number }[];
};

type LlmTrafficRow = {
  id: string;
  eventType: string;
  path: string;
  pageType: string | null;
  botName: string | null;
  referrerHost: string | null;
  referrerSource: string | null;
  utmSource: string | null;
  sessionId: string | null;
  conversionType: string | null;
  userAgent: string;
  clientIp: string | null;
  referer: string | null;
  createdAt: string | null;
};

type LlmTrafficSummary = {
  totalInWindow: number;
  sinceHours: number;
  crawlerHits: number;
  referralSessions: number;
  convertedSessions: number;
  conversionRate: number;
  chatgptReferralSessions: number;
  byBotName: { botName: string; count: number }[];
  byReferrerHost: { referrerHost: string; sessions: number }[];
  byReferrerSource: { referrerSource: string; sessions: number }[];
  byLandingPageType: { pageType: string; sessions: number }[];
  byConversionType: { conversionType: string; count: number }[];
  keySurfaceHits: { pageType: string; count: number }[];
};

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [usersData, setUsersData] = useState<UserRow[]>([]);
  const [claimsData, setClaimsData] = useState<ClaimRow[]>([]);
  const [claimedAgents, setClaimedAgents] = useState<ClaimedAgentRow[]>([]);
  const [submissions, setSubmissions] = useState<AgentSubmissionRow[]>([]);
  const [customPages, setCustomPages] = useState<CustomPageRow[]>([]);
  const [dashboardAccessItems, setDashboardAccessItems] = useState<DashboardAccessRow[]>([]);
  const [dashboardAccessSummary, setDashboardAccessSummary] = useState<DashboardAccessSummary | null>(null);
  const [dashboardAccessOutcome, setDashboardAccessOutcome] = useState<"" | "redirect_signin" | "rendered">("");
  const [llmTrafficItems, setLlmTrafficItems] = useState<LlmTrafficRow[]>([]);
  const [llmTrafficSummary, setLlmTrafficSummary] = useState<LlmTrafficSummary | null>(null);
  const [llmTrafficEventType, setLlmTrafficEventType] = useState<"" | "crawler_hit" | "llm_referral" | "llm_conversion">("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    async function checkAdmin() {
      try {
        const res = await fetch("/api/v1/me");
        const json = await res.json();
        setIsAdmin(Boolean(json?.success && json?.data?.isAdmin));
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    }
    checkAdmin();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    let isActive = true;
    async function loadTabData() {
      try {
        if (tab === "overview") {
          const res = await fetch("/api/v1/admin/overview", { cache: "no-store" });
          const json = await res.json();
          const data = unwrapClientResponse<OverviewData>(json);
          if (isActive) setOverview(data);
        }
        if (tab === "users") {
          const res = await fetch("/api/v1/admin/users?limit=100", { cache: "no-store" });
          const json = await res.json();
          const data = unwrapClientResponse<{ users?: UserRow[] }>(json);
          if (isActive) setUsersData(data.users ?? []);
        }
        if (tab === "claims") {
          const res = await fetch("/api/v1/admin/claims?status=PENDING&limit=100", { cache: "no-store" });
          const json = await res.json();
          const data = unwrapClientResponse<{ claims?: ClaimRow[] }>(json);
          if (isActive) setClaimsData(data.claims ?? []);
        }
        if (tab === "claimed_agents") {
          const res = await fetch("/api/v1/admin/claimed-agents?limit=250", { cache: "no-store" });
          const json = await res.json();
          const data = unwrapClientResponse<{ items?: ClaimedAgentRow[] }>(json);
          if (isActive) setClaimedAgents(data.items ?? []);
        }
        if (tab === "agent_submissions") {
          const res = await fetch("/api/v1/admin/agents/submissions?limit=100", { cache: "no-store" });
          const json = await res.json();
          const data = unwrapClientResponse<{ items?: AgentSubmissionRow[] }>(json);
          if (isActive) setSubmissions(data.items ?? []);
        }
        if (tab === "custom_pages") {
          const res = await fetch("/api/v1/admin/custom-pages?limit=100", { cache: "no-store" });
          const json = await res.json();
          const data = unwrapClientResponse<{ items?: CustomPageRow[] }>(json);
          if (isActive) setCustomPages(data.items ?? []);
        }
        if (tab === "dashboard_access") {
          const q = new URLSearchParams({
            limit: "200",
            sinceHours: "168",
            pathPrefix: "/dashboard",
          });
          if (dashboardAccessOutcome) q.set("outcome", dashboardAccessOutcome);
          const res = await fetch(`/api/v1/admin/dashboard-access?${q}`, { cache: "no-store" });
          const json = await res.json();
          const data = unwrapClientResponse<{
            items?: DashboardAccessRow[];
            summary?: DashboardAccessSummary;
          }>(json);
          if (isActive) {
            setDashboardAccessItems(data.items ?? []);
            setDashboardAccessSummary(data.summary ?? null);
          }
        }
        if (tab === "llm_traffic") {
          const q = new URLSearchParams({
            limit: "200",
            sinceHours: "168",
          });
          if (llmTrafficEventType) q.set("eventType", llmTrafficEventType);
          const res = await fetch(`/api/v1/admin/llm-traffic?${q}`, { cache: "no-store" });
          const json = await res.json();
          const data = unwrapClientResponse<{
            items?: LlmTrafficRow[];
            summary?: LlmTrafficSummary;
          }>(json);
          if (isActive) {
            setLlmTrafficItems(data.items ?? []);
            setLlmTrafficSummary(data.summary ?? null);
          }
        }
        if (isActive) setLastUpdated(new Date());
      } catch {
        if (isActive) setError("Failed to load admin data");
      }
    }

    loadTabData();
    const interval = setInterval(loadTabData, 60_000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [isAdmin, tab, dashboardAccessOutcome, llmTrafficEventType]);

  async function handleClaimAction(claimId: string, action: "approve" | "reject") {
    const res = await fetch(`/api/v1/admin/claims/${claimId}/${action}`, { method: "POST" });
    if (res.ok) {
      setClaimsData((prev) => prev.filter((c) => c.id !== claimId));
    }
  }

  if (loading) return <div className="p-8 text-sm text-[var(--text-secondary)]">Loading...</div>;

  if (!isAdmin) {
    return (
      <div className="agent-card p-12 text-center max-w-md mx-auto">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Access Denied</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Sign in with an admin email listed in ADMIN_EMAILS.</p>
        <Link href="/auth/signin?callbackUrl=/admin" className="mt-5 inline-flex rounded-full bg-[var(--accent-heart)] px-6 py-2.5 text-sm font-medium text-white">
          Sign in
        </Link>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "claims", label: "Claims" },
    { id: "claimed_agents", label: "Claimed Agents" },
    { id: "agent_submissions", label: "Agent Submissions" },
    { id: "custom_pages", label: "Custom Pages" },
    { id: "dashboard_access", label: "Dashboard access" },
    { id: "llm_traffic", label: "LLM traffic" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-gradient-primary">Admin Panel</h1>
        <p className="mt-1 text-[var(--text-secondary)]">Moderation dashboard for users and agent content.</p>
        {lastUpdated && (
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Last updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </header>

      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-all",
              tab === t.id ? "bg-[var(--accent-heart)]/20 text-[var(--accent-heart)]" : "text-[var(--text-secondary)] hover:bg-white/[0.04]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}

      {tab === "overview" && overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="agent-card p-4"><p className="text-xs text-[var(--text-tertiary)]">Users</p><p className="text-xl font-semibold">{overview.usersTotal}</p></div>
          <div className="agent-card p-4"><p className="text-xs text-[var(--text-tertiary)]">New Users (7d)</p><p className="text-xl font-semibold">{overview.usersLast7d}</p></div>
          <div className="agent-card p-4"><p className="text-xs text-[var(--text-tertiary)]">Active Agents</p><p className="text-xl font-semibold">{overview.activeAgents}</p></div>
          <div className="agent-card p-4"><p className="text-xs text-[var(--text-tertiary)]">Pending Agents</p><p className="text-xl font-semibold">{overview.pendingAgents}</p></div>
          <div className="agent-card p-4"><p className="text-xs text-[var(--text-tertiary)]">Pending Claims</p><p className="text-xl font-semibold">{overview.pendingClaims}</p></div>
          <div className="agent-card p-4"><p className="text-xs text-[var(--text-tertiary)]">Claimed Agents</p><p className="text-xl font-semibold">{overview.claimedAgents}</p></div>
          <div className="agent-card p-4"><p className="text-xs text-[var(--text-tertiary)]">Published Custom Pages</p><p className="text-xl font-semibold">{overview.customPagesPublished}</p></div>
          <div className="agent-card p-4"><p className="text-xs text-[var(--text-tertiary)]">Draft/Disabled Custom Pages</p><p className="text-xl font-semibold">{overview.customPagesDraft}</p></div>
        </div>
      )}

      {tab === "users" && (
        <div className="agent-card p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--text-secondary)]"><th className="p-3">Email</th><th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">Created</th></tr></thead>
            <tbody>{usersData.map((u) => <tr key={u.id} className="border-t border-[var(--border)]"><td className="p-3">{u.email}</td><td className="p-3">{u.name ?? "-"}</td><td className="p-3">{u.accountType}</td><td className="p-3">{u.createdAt ? new Date(u.createdAt).toLocaleString() : "-"}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {tab === "claims" && (
        <div className="space-y-3">
          {claimsData.map((c) => (
            <div key={c.id} className="agent-card p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{c.agentName ?? "Unknown Agent"} ({c.agentSlug ?? "-"})</p>
                <p className="text-xs text-[var(--text-secondary)]">{c.userEmail ?? "Unknown user"} • {c.verificationMethod} • {new Date(c.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleClaimAction(c.id, "approve")} className="rounded px-3 py-1 text-xs bg-[#30d158]/20 text-[#30d158]">Approve</button>
                <button onClick={() => handleClaimAction(c.id, "reject")} className="rounded px-3 py-1 text-xs bg-red-500/20 text-red-400">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "agent_submissions" && (
        <div className="agent-card p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--text-secondary)]"><th className="p-3">Agent</th><th className="p-3">Source</th><th className="p-3">Status</th><th className="p-3">Claimed By</th><th className="p-3">Created</th></tr></thead>
            <tbody>{submissions.map((a) => <tr key={a.id} className="border-t border-[var(--border)]"><td className="p-3">{a.name} ({a.slug})</td><td className="p-3">{a.source}</td><td className="p-3">{a.status}</td><td className="p-3">{a.claimedByUserEmail ?? "-"}</td><td className="p-3">{a.createdAt ? new Date(a.createdAt).toLocaleString() : "-"}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {tab === "claimed_agents" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="agent-card p-4">
              <p className="text-xs text-[var(--text-tertiary)]">Claimed Agent Count</p>
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{claimedAgents.length}</p>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs text-[var(--text-tertiary)]">With Custom Page</p>
              <p className="text-2xl font-semibold text-[var(--text-primary)]">
                {claimedAgents.filter((a) => a.hasCustomPage).length}
              </p>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs text-[var(--text-tertiary)]">Unique Owners</p>
              <p className="text-2xl font-semibold text-[var(--text-primary)]">
                {new Set(claimedAgents.map((a) => a.claimedByUserId).filter(Boolean)).size}
              </p>
            </div>
          </div>

          <div className="agent-card p-0 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-secondary)]">
                  <th className="p-3">Agent</th>
                  <th className="p-3">Owner</th>
                  <th className="p-3">Verification</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Links</th>
                  <th className="p-3">Claimed</th>
                </tr>
              </thead>
              <tbody>
                {claimedAgents.map((agent) => (
                  <tr key={agent.id} className="border-t border-[var(--border)] align-top">
                    <td className="p-3">
                      <p className="font-medium text-[var(--text-primary)]">{agent.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{agent.slug}</p>
                      <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{agent.source}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-[var(--text-primary)]">{agent.ownerEmail ?? "Unknown owner"}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{agent.ownerName ?? "-"}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-[var(--text-primary)]">{agent.verificationTier}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{agent.verificationMethod ?? "Not specified"}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-[var(--text-primary)]">{agent.claimStatus}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {agent.hasCustomPage ? "Custom page enabled" : "No custom page"}
                      </p>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/agent/${agent.slug}`} target="_blank" className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/[0.04]">
                          Profile
                        </Link>
                        <Link href={`/agent/${agent.slug}/manage`} target="_blank" className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/[0.04]">
                          Manage
                        </Link>
                        <a href={agent.sourceUrl} target="_blank" rel="noreferrer" className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/[0.04]">
                          Source
                        </a>
                        {agent.homepage && (
                          <a href={agent.homepage} target="_blank" rel="noreferrer" className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/[0.04]">
                            Homepage
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-[var(--text-secondary)]">
                      {agent.claimedAt ? new Date(agent.claimedAt).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "custom_pages" && (
        <div className="agent-card p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--text-secondary)]"><th className="p-3">Agent</th><th className="p-3">Status</th><th className="p-3">Updated</th></tr></thead>
            <tbody>{customPages.map((c) => <tr key={c.id} className="border-t border-[var(--border)]"><td className="p-3">{c.agentName} ({c.agentSlug})</td><td className="p-3">{c.status}</td><td className="p-3">{c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "-"}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {tab === "dashboard_access" && dashboardAccessSummary && (
        <div className="space-y-6">
          <p className="text-sm text-[var(--text-secondary)]">
            Logged requests to paths under <code className="text-[var(--text-primary)]">{dashboardAccessSummary.pathPrefix}</code> in the last{" "}
            {dashboardAccessSummary.sinceHours} hours.{" "}
            <span className="text-[var(--text-tertiary)]">
              <code className="text-[var(--text-primary)]">redirect_signin</code> is an unauthenticated hit (often bots or scanners);{" "}
              <code className="text-[var(--text-primary)]">rendered</code> reached the dashboard shell with a session or guest cookie.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-tertiary)]">Outcome:</span>
            {(["", "redirect_signin", "rendered"] as const).map((v) => (
              <button
                key={v || "all"}
                type="button"
                onClick={() => setDashboardAccessOutcome(v)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-all",
                  dashboardAccessOutcome === v
                    ? "bg-[var(--accent-heart)]/20 text-[var(--accent-heart)]"
                    : "text-[var(--text-secondary)] hover:bg-white/[0.04]"
                )}
              >
                {v === "" ? "All" : v}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="agent-card p-4">
              <p className="text-xs text-[var(--text-tertiary)]">Events (window)</p>
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardAccessSummary.totalInWindow}</p>
            </div>
            <div className="agent-card p-4 sm:col-span-2">
              <p className="text-xs text-[var(--text-tertiary)] mb-2">By outcome</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {dashboardAccessSummary.byOutcome.map((o) => (
                  <span key={o.outcome} className="text-[var(--text-primary)]">
                    <span className="text-[var(--text-secondary)]">{o.outcome}:</span> {o.count}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="agent-card p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Top paths</p>
              <ul className="space-y-1 text-sm">
                {dashboardAccessSummary.byPath.map((r) => (
                  <li key={r.path} className="flex justify-between gap-2">
                    <span className="truncate text-[var(--text-primary)]" title={r.path}>{r.path}</span>
                    <span className="shrink-0 text-[var(--text-tertiary)]">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">By bot label (unknown = no UA match)</p>
              <ul className="space-y-1 text-sm">
                {dashboardAccessSummary.byBotLabel.map((r) => (
                  <li key={r.botLabel} className="flex justify-between gap-2">
                    <span className="text-[var(--text-primary)]">{r.botLabel}</span>
                    <span className="text-[var(--text-tertiary)]">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="agent-card p-0 overflow-auto max-h-[min(70vh,720px)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-secondary)]">
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">Time</th>
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">Path</th>
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">Outcome</th>
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">Bot</th>
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">IP</th>
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">User-Agent</th>
                </tr>
              </thead>
              <tbody>
                {dashboardAccessItems.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)] align-top">
                    <td className="p-3 whitespace-nowrap text-xs text-[var(--text-secondary)]">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}
                    </td>
                    <td className="p-3 text-xs break-all max-w-[200px]">{row.path}</td>
                    <td className="p-3 text-xs">{row.outcome}</td>
                    <td className="p-3 text-xs">{row.botLabel ?? "—"}</td>
                    <td className="p-3 text-xs font-mono">{row.clientIp ?? "—"}</td>
                    <td className="p-3 text-xs break-all max-w-[280px] text-[var(--text-secondary)]">{row.userAgent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "llm_traffic" && llmTrafficSummary && (
        <div className="space-y-6">
          <p className="text-sm text-[var(--text-secondary)]">
            First-party analytics for crawler hits, LLM referrals, and downstream conversion events in the last{" "}
            {llmTrafficSummary.sinceHours} hours.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-tertiary)]">Event type:</span>
            {(["", "crawler_hit", "llm_referral", "llm_conversion"] as const).map((v) => (
              <button
                key={v || "all"}
                type="button"
                onClick={() => setLlmTrafficEventType(v)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-all",
                  llmTrafficEventType === v
                    ? "bg-[var(--accent-heart)]/20 text-[var(--accent-heart)]"
                    : "text-[var(--text-secondary)] hover:bg-white/[0.04]"
                )}
              >
                {v === "" ? "All" : v}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="agent-card p-4">
              <p className="text-xs text-[var(--text-tertiary)]">Crawler hits</p>
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{llmTrafficSummary.crawlerHits}</p>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs text-[var(--text-tertiary)]">Referral sessions</p>
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{llmTrafficSummary.referralSessions}</p>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs text-[var(--text-tertiary)]">Converted sessions</p>
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{llmTrafficSummary.convertedSessions}</p>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs text-[var(--text-tertiary)]">Conversion rate</p>
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{llmTrafficSummary.conversionRate}%</p>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs text-[var(--text-tertiary)]">`utm_source=chatgpt.com`</p>
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{llmTrafficSummary.chatgptReferralSessions}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="agent-card p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Crawler hits by bot</p>
              <ul className="space-y-1 text-sm">
                {llmTrafficSummary.byBotName.map((row) => (
                  <li key={row.botName} className="flex justify-between gap-2">
                    <span className="text-[var(--text-primary)]">{row.botName}</span>
                    <span className="text-[var(--text-tertiary)]">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Referral sessions by host</p>
              <ul className="space-y-1 text-sm">
                {llmTrafficSummary.byReferrerHost.map((row) => (
                  <li key={row.referrerHost} className="flex justify-between gap-2">
                    <span className="text-[var(--text-primary)]">{row.referrerHost}</span>
                    <span className="text-[var(--text-tertiary)]">{row.sessions}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Referral sessions by source</p>
              <ul className="space-y-1 text-sm">
                {llmTrafficSummary.byReferrerSource.map((row) => (
                  <li key={row.referrerSource} className="flex justify-between gap-2">
                    <span className="text-[var(--text-primary)]">{row.referrerSource}</span>
                    <span className="text-[var(--text-tertiary)]">{row.sessions}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Referral landing page templates</p>
              <ul className="space-y-1 text-sm">
                {llmTrafficSummary.byLandingPageType.map((row) => (
                  <li key={row.pageType} className="flex justify-between gap-2">
                    <span className="text-[var(--text-primary)]">{row.pageType}</span>
                    <span className="text-[var(--text-tertiary)]">{row.sessions}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Conversion events</p>
              <ul className="space-y-1 text-sm">
                {llmTrafficSummary.byConversionType.map((row) => (
                  <li key={row.conversionType} className="flex justify-between gap-2">
                    <span className="text-[var(--text-primary)]">{row.conversionType}</span>
                    <span className="text-[var(--text-tertiary)]">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="agent-card p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Weekly crawler acceptance surfaces</p>
              <ul className="space-y-1 text-sm">
                {llmTrafficSummary.keySurfaceHits.map((row) => (
                  <li key={row.pageType} className="flex justify-between gap-2">
                    <span className="text-[var(--text-primary)]">{row.pageType}</span>
                    <span className="text-[var(--text-tertiary)]">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="agent-card p-0 overflow-auto max-h-[min(70vh,720px)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-secondary)]">
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">Time</th>
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">Event</th>
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">Path</th>
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">Page type</th>
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">Source / bot</th>
                  <th className="p-3 sticky top-0 bg-[var(--bg-elevated)]">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {llmTrafficItems.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)] align-top">
                    <td className="p-3 whitespace-nowrap text-xs text-[var(--text-secondary)]">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}
                    </td>
                    <td className="p-3 text-xs">{row.eventType}</td>
                    <td className="p-3 text-xs break-all max-w-[240px]">{row.path}</td>
                    <td className="p-3 text-xs">{row.pageType ?? "—"}</td>
                    <td className="p-3 text-xs">
                      {row.botName ?? row.referrerSource ?? row.referrerHost ?? "—"}
                    </td>
                    <td className="p-3 text-xs">{row.conversionType ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


