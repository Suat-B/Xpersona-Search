"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Tab = "overview" | "users" | "claims" | "agent_submissions" | "custom_pages";

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

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [usersData, setUsersData] = useState<UserRow[]>([]);
  const [claimsData, setClaimsData] = useState<ClaimRow[]>([]);
  const [submissions, setSubmissions] = useState<AgentSubmissionRow[]>([]);
  const [customPages, setCustomPages] = useState<CustomPageRow[]>([]);

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

    async function loadTabData() {
      try {
        if (tab === "overview") {
          const res = await fetch("/api/v1/admin/overview");
          const json = await res.json();
          if (json.success) setOverview(json.data);
        }
        if (tab === "users") {
          const res = await fetch("/api/v1/admin/users?limit=100");
          const json = await res.json();
          if (json.success) setUsersData(json.data.users ?? []);
        }
        if (tab === "claims") {
          const res = await fetch("/api/v1/admin/claims?status=PENDING&limit=100");
          const json = await res.json();
          setClaimsData(json.claims ?? []);
        }
        if (tab === "agent_submissions") {
          const res = await fetch("/api/v1/admin/agents/submissions?limit=100");
          const json = await res.json();
          if (json.success) setSubmissions(json.data.items ?? []);
        }
        if (tab === "custom_pages") {
          const res = await fetch("/api/v1/admin/custom-pages?limit=100");
          const json = await res.json();
          if (json.success) setCustomPages(json.data.items ?? []);
        }
      } catch {
        setError("Failed to load admin data");
      }
    }

    loadTabData();
  }, [isAdmin, tab]);

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
    { id: "agent_submissions", label: "Agent Submissions" },
    { id: "custom_pages", label: "Custom Pages" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-gradient-primary">Admin Panel</h1>
        <p className="mt-1 text-[var(--text-secondary)]">Moderation dashboard for users and agent content.</p>
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

      {tab === "custom_pages" && (
        <div className="agent-card p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--text-secondary)]"><th className="p-3">Agent</th><th className="p-3">Status</th><th className="p-3">Updated</th></tr></thead>
            <tbody>{customPages.map((c) => <tr key={c.id} className="border-t border-[var(--border)]"><td className="p-3">{c.agentName} ({c.agentSlug})</td><td className="p-3">{c.status}</td><td className="p-3">{c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "-"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}



