"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CustomAgentPage } from "@/components/agent/CustomAgentPage";

type CustomLink = { label: string; url: string };
type Tab = "structured" | "html" | "css" | "js" | "preview" | "publish";

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

interface CustomizationPayload {
  status?: "DRAFT" | "PUBLISHED" | "DISABLED";
  customHtml?: string | null;
  customCss?: string | null;
  customJs?: string | null;
  widgetLayout?: unknown[];
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "structured", label: "Structured" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "js", label: "JS" },
  { id: "preview", label: "Preview" },
  { id: "publish", label: "Publish" },
];

export default function ManagePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStructured, setSavingStructured] = useState(false);
  const [savingCustomization, setSavingCustomization] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("structured");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const [description, setDescription] = useState("");
  const [homepage, setHomepage] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [readme, setReadme] = useState("");
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  const [customHtml, setCustomHtml] = useState("");
  const [customCss, setCustomCss] = useState("");
  const [customJs, setCustomJs] = useState("");
  const [customStatus, setCustomStatus] = useState<"DRAFT" | "PUBLISHED" | "DISABLED">("DRAFT");
  const [preview, setPreview] = useState<{ html: string; css: string; js: string } | null>(
    null
  );

  useEffect(() => {
    async function load() {
      try {
        const [manageRes, customRes] = await Promise.all([
          fetch(`/api/agents/${slug}/manage`, { credentials: "include" }),
          fetch(`/api/agents/${slug}/customization`, { credentials: "include" }),
        ]);

        if (manageRes.status === 401 || customRes.status === 401) {
          router.push(`/auth/signin?callbackUrl=/agent/${slug}/manage`);
          return;
        }
        if (manageRes.status === 403 || customRes.status === 403) {
          setError("You are not the owner of this page.");
          setLoading(false);
          return;
        }
        if (!manageRes.ok) {
          setError("Failed to load agent data.");
          setLoading(false);
          return;
        }

        const manageData = await manageRes.json();
        setAgent(manageData.agent);

        const o = (manageData.overrides ?? {}) as Overrides;
        setDescription(o.description ?? manageData.agent.description ?? "");
        setHomepage(o.homepage ?? manageData.agent.homepage ?? "");
        setCapabilities((o.capabilities ?? manageData.agent.capabilities ?? []).join(", "));
        setReadme(o.readme ?? manageData.agent.readme ?? "");
        setCustomLinks(o.customLinks ?? []);

        if (customRes.ok) {
          const customData = await customRes.json();
          const c = customData.customization as CustomizationPayload | null;
          if (c) {
            setCustomHtml(c.customHtml ?? "");
            setCustomCss(c.customCss ?? "");
            setCustomJs(c.customJs ?? "");
            setCustomStatus(c.status ?? "DRAFT");
          }
        }
      } catch {
        setError("Network error while loading manage data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug, router]);

  const saveStructured = useCallback(async () => {
    setSavingStructured(true);
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
        setError(data.error ?? "Failed to save structured changes.");
      } else {
        setSuccess("Structured changes saved.");
      }
    } catch {
      setError("Network error while saving structured changes.");
    } finally {
      setSavingStructured(false);
    }
  }, [slug, description, homepage, capabilities, readme, customLinks]);

  const saveCustomization = useCallback(
    async (status: "DRAFT" | "PUBLISHED" | "DISABLED") => {
      setSavingCustomization(true);
      setError("");
      setSuccess("");
      setWarnings([]);
      try {
        const res = await fetch(`/api/agents/${slug}/customization`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            customHtml,
            customCss,
            customJs,
            widgetLayout: [],
            status,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to save customization.");
          return;
        }
        setCustomStatus(status);
        setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        setSuccess(
          status === "PUBLISHED"
            ? "Customization published."
            : status === "DISABLED"
              ? "Public custom page disabled."
              : "Customization draft saved."
        );
      } catch {
        setError("Network error while saving customization.");
      } finally {
        setSavingCustomization(false);
      }
    },
    [slug, customHtml, customCss, customJs]
  );

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setError("");
    setWarnings([]);
    try {
      const res = await fetch(`/api/agents/${slug}/customization/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customHtml, customCss, customJs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate preview.");
        return;
      }
      setPreview(data.preview ?? null);
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      if (Array.isArray(data.blockedPatterns) && data.blockedPatterns.length > 0) {
        setError(`Blocked JS patterns: ${data.blockedPatterns.join(", ")}`);
      }
    } catch {
      setError("Network error while generating preview.");
    } finally {
      setPreviewLoading(false);
    }
  }, [slug, customHtml, customCss, customJs]);

  const addLink = () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    try {
      new URL(newLinkUrl);
    } catch {
      setError("Invalid URL for custom link.");
      return;
    }
    setCustomLinks([...customLinks, { label: newLinkLabel.trim(), url: newLinkUrl.trim() }]);
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
    "w-full rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50";
  const labelClass =
    "block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <div className="max-w-4xl mx-auto px-4 py-12">
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
          <div className="px-8 py-6 border-b border-[var(--border)]">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              Customize {agent?.name}
            </h1>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Claim verified. Build your custom agent page and publish it safely.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    activeTab === tab.id
                      ? "bg-[var(--accent-heart)] text-white border-[var(--accent-heart)]"
                      : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent-heart)]/40"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-8 space-y-5">
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
            {warnings.length > 0 && (
              <div className="rounded-xl border border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/5 px-4 py-3 text-sm text-[var(--accent-warning)]">
                {warnings.map((w, i) => (
                  <div key={`${w}-${i}`}>{w}</div>
                ))}
              </div>
            )}

            {activeTab === "structured" && (
              <>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={`${inputClass} resize-y min-h-[80px]`}
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
                    className={`${inputClass} resize-y min-h-[220px] font-mono text-xs`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Custom Links</label>
                  {customLinks.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {customLinks.map((link, i) => (
                        <div
                          key={`${link.label}-${i}`}
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
                            className="text-[var(--text-quaternary)] hover:text-[#ff453a] transition-colors"
                          >
                            ×
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
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)]"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <button
                  onClick={saveStructured}
                  disabled={savingStructured}
                  className="rounded-xl bg-[var(--accent-heart)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {savingStructured ? "Saving..." : "Save Structured Changes"}
                </button>
              </>
            )}

            {(activeTab === "html" || activeTab === "css" || activeTab === "js") && (
              <>
                <div>
                  <label className={labelClass}>
                    {activeTab === "html"
                      ? "Custom HTML"
                      : activeTab === "css"
                        ? "Custom CSS"
                        : "Custom JS"}
                  </label>
                  <textarea
                    value={
                      activeTab === "html" ? customHtml : activeTab === "css" ? customCss : customJs
                    }
                    onChange={(e) =>
                      activeTab === "html"
                        ? setCustomHtml(e.target.value)
                        : activeTab === "css"
                          ? setCustomCss(e.target.value)
                          : setCustomJs(e.target.value)
                    }
                    className={`${inputClass} resize-y min-h-[360px] font-mono text-xs`}
                    placeholder={
                      activeTab === "html"
                        ? "<div>Your custom section</div>"
                        : activeTab === "css"
                          ? ".hero { color: #fff; }"
                          : "XpersonaBridge.track('view_loaded');"
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => saveCustomization("DRAFT")}
                    disabled={savingCustomization}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-2.5 text-sm font-semibold text-[var(--text-secondary)] disabled:opacity-60"
                  >
                    Save Draft
                  </button>
                  <button
                    onClick={() => saveCustomization("PUBLISHED")}
                    disabled={savingCustomization}
                    className="rounded-xl bg-[var(--accent-heart)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Publish
                  </button>
                </div>
              </>
            )}

            {activeTab === "preview" && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={loadPreview}
                    disabled={previewLoading}
                    className="rounded-xl bg-[var(--accent-heart)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {previewLoading ? "Rendering Preview..." : "Refresh Preview"}
                  </button>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    Preview uses the same server sanitization as publish.
                  </span>
                </div>

                {preview && (
                  <CustomAgentPage
                    agentSlug={slug}
                    code={preview}
                    className="w-full min-h-[65vh] rounded-xl border border-[var(--border)] bg-white"
                  />
                )}
              </>
            )}

            {activeTab === "publish" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                  <p className="text-sm text-[var(--text-primary)]">
                    Current custom page status:{" "}
                    <span className="font-semibold">{customStatus}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => saveCustomization("PUBLISHED")}
                    disabled={savingCustomization}
                    className="rounded-xl bg-[var(--accent-heart)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Publish Custom Page
                  </button>
                  <button
                    onClick={() => saveCustomization("DRAFT")}
                    disabled={savingCustomization}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-2.5 text-sm font-semibold text-[var(--text-secondary)] disabled:opacity-60"
                  >
                    Keep as Draft
                  </button>
                  <button
                    onClick={() => saveCustomization("DISABLED")}
                    disabled={savingCustomization}
                    className="rounded-xl border border-[#ff453a]/40 bg-[#ff453a]/10 px-5 py-2.5 text-sm font-semibold text-[#ff453a] disabled:opacity-60"
                  >
                    Disable Public Custom Page
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
