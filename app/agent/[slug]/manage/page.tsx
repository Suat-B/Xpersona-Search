"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type CustomLink = { label: string; url: string };

interface AgentData {
  name: string;
  slug: string;
  description: string | null;
  homepage: string | null;
  capabilities: string[];
  protocols: string[];
  readme: string | null;
  source: string;
  claimStatus: string;
  claimedByUserId: string | null;
}

interface Overrides {
  description?: string;
  homepage?: string | null;
  capabilities?: string[];
  protocols?: string[];
  readme?: string;
  customLinks?: CustomLink[];
}

export default function ManagePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [description, setDescription] = useState("");
  const [homepage, setHomepage] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [readme, setReadme] = useState("");
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/agents/${slug}/manage`, {
        credentials: "include",
      });
      if (res.status === 401) {
        router.push(`/auth/signin?callbackUrl=/agent/${slug}/manage`);
        return;
      }
      if (res.status === 403) {
        setError("You are not the owner of this page.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Failed to load agent data.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setAgent(data.agent);
      setOverrides(data.overrides);

      const o = data.overrides as Overrides;
      setDescription(o.description ?? data.agent.description ?? "");
      setHomepage(o.homepage ?? data.agent.homepage ?? "");
      setCapabilities(
        (o.capabilities ?? data.agent.capabilities ?? []).join(", ")
      );
      setReadme(o.readme ?? data.agent.readme ?? "");
      setCustomLinks(o.customLinks ?? []);
      setLoading(false);
    }
    load();
  }, [slug, router]);

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    const capsArray = capabilities
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const body: Overrides = {
      description,
      homepage: homepage || null,
      capabilities: capsArray,
      readme: readme || undefined,
      customLinks,
    };

    try {
      const res = await fetch(`/api/agents/${slug}/manage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save changes.");
      } else {
        setSuccess("Changes saved successfully.");
        setOverrides(data.overrides);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSaving(false);
  }, [slug, description, homepage, capabilities, readme, customLinks]);

  const addLink = () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    try {
      new URL(newLinkUrl);
    } catch {
      setError("Invalid URL for custom link.");
      return;
    }
    setCustomLinks([
      ...customLinks,
      { label: newLinkLabel.trim(), url: newLinkUrl.trim() },
    ]);
    setNewLinkLabel("");
    setNewLinkUrl("");
  };

  const removeLink = (index: number) => {
    setCustomLinks(customLinks.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)]">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-heart)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-deep)] p-6">
        <div className="max-w-md w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
          <p className="text-sm text-[#ff453a] mb-4">{error}</p>
          <Link
            href={`/agent/${slug}`}
            className="text-sm font-medium text-[var(--accent-heart)] hover:underline"
          >
            Back to agent page
          </Link>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 transition-colors";
  const labelClass =
    "block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link
          href={`/agent/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {agent?.name}
        </Link>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-8 py-6 border-b border-[var(--border)] bg-gradient-to-r from-[#30d158]/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#30d158]/15 border border-[#30d158]/25 text-[#30d158]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)]">
                  Manage {agent?.name}
                </h1>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Edit your page details. Changes override crawled data.
                </p>
              </div>
            </div>
          </div>

          <div className="p-8 space-y-6">
            {error && (
              <div className="rounded-xl border border-[#ff453a]/20 bg-[#ff453a]/5 px-4 py-3 text-sm text-[#ff453a]">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl border border-[#30d158]/20 bg-[#30d158]/5 px-4 py-3 text-sm text-[#30d158]">
                {success}
              </div>
            )}

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`${inputClass} resize-y min-h-[80px]`}
                placeholder="Describe your project..."
                maxLength={5000}
              />
            </div>

            <div>
              <label className={labelClass}>Homepage URL</label>
              <input
                type="url"
                value={homepage}
                onChange={(e) => setHomepage(e.target.value)}
                className={inputClass}
                placeholder="https://your-project.com"
              />
            </div>

            <div>
              <label className={labelClass}>Capabilities (comma-separated)</label>
              <input
                type="text"
                value={capabilities}
                onChange={(e) => setCapabilities(e.target.value)}
                className={inputClass}
                placeholder="search, code-generation, data-analysis"
              />
            </div>

            <div>
              <label className={labelClass}>README / Documentation</label>
              <textarea
                value={readme}
                onChange={(e) => setReadme(e.target.value)}
                className={`${inputClass} resize-y min-h-[200px] font-mono text-xs`}
                placeholder="# Your Project&#10;&#10;Markdown documentation..."
              />
            </div>

            {/* Custom Links */}
            <div>
              <label className={labelClass}>Custom Links</label>
              {customLinks.length > 0 && (
                <div className="space-y-2 mb-3">
                  {customLinks.map((link, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                    >
                      <span className="text-sm text-[var(--text-primary)] flex-1 truncate">
                        {link.label}
                      </span>
                      <span className="text-xs text-[var(--text-quaternary)] truncate max-w-[200px]">
                        {link.url}
                      </span>
                      <button
                        onClick={() => removeLink(i)}
                        className="text-[var(--text-quaternary)] hover:text-[#ff453a] transition-colors flex-shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder="Label"
                  maxLength={50}
                />
                <input
                  type="url"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder="https://..."
                />
                <button
                  onClick={addLink}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors flex-shrink-0"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <Link
                href={`/agent/${slug}?view=details`}
                target="_blank"
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors text-center"
              >
                Preview
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
