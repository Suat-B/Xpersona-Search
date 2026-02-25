"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiV1 } from "@/lib/api/url";

type Job = {
  id: string;
  title: string;
  status: string;
  budgetCents: number;
  currency: string;
  postedAt: string;
};

const TABS = ["POSTED", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"] as const;

export default function DashboardJobsPage() {
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("POSTED");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    budgetCents: 5000,
    currency: "USD",
  });

  useEffect(() => {
    const title = searchParams.get("title");
    const q = searchParams.get("q");
    const agent = searchParams.get("agent");
    if (title || q || agent) {
      setForm((prev) => ({
        ...prev,
        title: title ?? prev.title,
        description:
          prev.description ||
          [q ? `Search context: ${q}` : null, agent ? `Requested agent: ${agent}` : null]
            .filter(Boolean)
            .join("\n"),
      }));
    }
  }, [searchParams]);

  async function loadJobs() {
    const res = await fetch(apiV1("/economy/jobs"), { credentials: "include" });
    const data = await res.json();
    if (res.ok) setJobs(data.data?.jobs ?? []);
  }

  useEffect(() => {
    loadJobs();
  }, []);

  const filtered = useMemo(() => jobs.filter((j) => j.status === activeTab), [jobs, activeTab]);

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(apiV1("/economy/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          budgetCents: Number(form.budgetCents),
          currency: form.currency,
          metadata: { source: "dashboard", query: searchParams.get("q") ?? undefined },
        }),
      });
      if (res.ok) {
        setForm({ title: "", description: "", budgetCents: 5000, currency: "USD" });
        await loadJobs();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Economy Jobs</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Post jobs, manage delivery, and release escrow payouts.</p>
      </header>

      <form onSubmit={createJob} className="agent-card p-4 space-y-3">
        <h2 className="font-medium text-[var(--text-primary)]">Create Job</h2>
        <input
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
          placeholder="Job title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
        />
        <textarea
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
          placeholder="Describe scope and deliverables"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={4}
          required
        />
        <div className="flex gap-3">
          <input
            type="number"
            min={100}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
            value={form.budgetCents}
            onChange={(e) => setForm((f) => ({ ...f, budgetCents: Number(e.target.value) }))}
            required
          />
          <input
            className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
            required
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-[var(--accent-heart)] text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {creating ? "Creating..." : "Post Job"}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-3 py-1.5 text-xs border ${
              activeTab === tab
                ? "border-[var(--accent-heart)] text-[var(--accent-heart)] bg-[var(--accent-heart)]/10"
                : "border-[var(--border)] text-[var(--text-secondary)]"
            }`}
          >
            {tab.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No jobs in {activeTab.toLowerCase()}.</p>
        ) : (
          filtered.map((job) => (
            <div key={job.id} className="agent-card p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-[var(--text-primary)]">{job.title}</p>
                <p className="text-xs text-[var(--text-secondary)]">{job.currency} {(job.budgetCents / 100).toFixed(2)} • {job.status}</p>
              </div>
              <div className="flex gap-2">
                {job.status === "ACCEPTED" && <ActionButton path={apiV1(`/economy/jobs/${job.id}/start`)} onDone={loadJobs}>Start</ActionButton>}
                {job.status === "REVIEW" && <ActionButton path={apiV1(`/economy/jobs/${job.id}/approve`)} onDone={loadJobs}>Approve</ActionButton>}
                {(job.status === "POSTED" || job.status === "ACCEPTED" || job.status === "IN_PROGRESS" || job.status === "REVIEW") && (
                  <ActionButton path={apiV1(`/economy/jobs/${job.id}/cancel`)} onDone={loadJobs} variant="danger">Cancel</ActionButton>
                )}
                {job.status === "ACCEPTED" && <ActionButton path={apiV1(`/economy/jobs/${job.id}/fund`)} onDone={loadJobs}>Fund</ActionButton>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActionButton({
  path,
  children,
  onDone,
  variant = "default",
}: {
  path: string;
  children: React.ReactNode;
  onDone: () => void;
  variant?: "default" | "danger";
}) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      onClick={async () => {
        setLoading(true);
        try {
          await fetch(path, { method: "POST", credentials: "include" });
          await onDone();
        } finally {
          setLoading(false);
        }
      }}
      disabled={loading}
      className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
        variant === "danger"
          ? "bg-red-500/10 text-red-400 border border-red-500/20"
          : "bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)]"
      }`}
    >
      {loading ? "..." : children}
    </button>
  );
}
