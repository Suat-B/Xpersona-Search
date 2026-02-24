"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { buildUpgradeAuthUrl } from "@/lib/auth-flow";

const inputClass =
  "w-full rounded-lg border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#30d158]/50";

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    fetch("/api/me/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        currentPassword,
        newPassword,
        confirmPassword,
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setSuccess(true);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        } else {
          setError(res.message ?? "Failed to change password.");
        }
      })
      .catch(() => setError("Something went wrong. Please try again."))
      .finally(() => setLoading(false));
  };

  return (
    <GlassCard className="p-5">
      <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
        Change password
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Update your account password. Use a strong, unique password.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Current password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
        {error && (
          <p className="text-sm text-[#ff453a] bg-[#ff453a]/10 border border-[#ff453a]/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-[#30d158] bg-[#30d158]/10 border border-[#30d158]/20 rounded-lg px-3 py-2">
            Password updated successfully.
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-[#30d158] px-4 py-2 text-sm font-medium text-white hover:bg-[#30d158]/90 disabled:opacity-50"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </GlassCard>
  );
}

function SignalPreferencesSection() {
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/me/signal-preferences", { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setDiscordWebhookUrl(res.data.discordWebhookUrl ?? "");
          setWebhookUrl(res.data.webhookUrl ?? "");
        }
      });
  }, []);

  const handleSave = () => {
    setSaving(true);
    setSaved(false);
    fetch("/api/me/signal-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        discordWebhookUrl: discordWebhookUrl.trim() || null,
        webhookUrl: webhookUrl.trim() || null,
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setSaved(true);
      })
      .finally(() => setSaving(false));
  };

  return (
    <GlassCard className="p-5">
      <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
        Signal Delivery
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Configure where to receive strategy signals (Discord webhook, custom webhook).
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Discord Webhook URL
          </label>
          <input
            type="url"
            value={discordWebhookUrl}
            onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="w-full rounded-lg border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#30d158]/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Custom Webhook URL
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-server.com/signals"
            className="w-full rounded-lg border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#30d158]/50"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-[#30d158] px-4 py-2 text-sm font-medium text-white hover:bg-[#30d158]/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </GlassCard>
  );
}

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
  const linkHref = buildUpgradeAuthUrl(
    "signup",
    user?.accountType ?? null,
    "/dashboard/settings"
  );

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

      {/* Change password — only for email/password accounts */}
      {(user?.isPermanent || user?.accountType === "email") && <ChangePasswordSection />}

      {/* Signal Preferences */}
      <SignalPreferencesSection />

      {/* API Key */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          API Key
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Give your AI the link to xpersona.co/dashboard/api and this API key.
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
