"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { buildUpgradeAuthUrl } from "@/lib/auth-flow";

const inputClass =
  "w-full rounded-lg border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#30d158]/50";

function responseMessage(data: any): string | null {
  if (!data || typeof data !== "object") return null;
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  if (data.error && typeof data.error === "object") {
    const msg = (data.error as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return null;
}

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
    fetch("/api/v1/me/change-password", {
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
            placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
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
          {loading ? "Updatingâ€¦" : "Update password"}
        </button>
      </form>
    </GlassCard>
  );
}

function LinkEmailSection({
  onLinked,
  mergeSignInHref,
  mergeSignUpHref,
}: {
  onLinked?: () => void | Promise<void>;
  mergeSignInHref: string;
  mergeSignUpHref: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/me/link-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(responseMessage(data) ?? "Failed to link email. Please try again.");
        return;
      }

      setSuccess(true);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      await onLinked?.();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard className="p-5">
      <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
        Link email
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Add an email + password to keep this account and sign in again later.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Confirm password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
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
            Email linked. You can now sign in with this email + password.
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-[#30d158] px-4 py-2 text-sm font-medium text-white hover:bg-[#30d158]/90 disabled:opacity-50"
        >
          {loading ? "Linking..." : "Link email"}
        </button>
      </form>

      <div className="mt-4 border-t border-[var(--dash-divider)] pt-4">
        <p className="text-xs text-[var(--text-secondary)]">
          Already have an account? Sign in (or create a new one) to merge this temporary account into it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={mergeSignInHref}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-white/5 transition-colors"
          >
            Sign in &amp; merge
          </Link>
          <Link
            href={mergeSignUpHref}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent-heart)]/50 bg-[var(--accent-heart)]/10 px-3 py-2 text-xs font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
          >
            Create account &amp; merge
          </Link>
        </div>
      </div>
    </GlassCard>
  );
}

function SignalPreferencesSection() {
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/v1/me/signal-preferences", { credentials: "include" })
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
    fetch("/api/v1/me/signal-preferences", {
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
          {saving ? "Savingâ€¦" : saved ? "Saved" : "Save"}
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

type PlaygroundSubscriptionSnapshot = {
  plan: "trial" | "starter" | "builder" | "studio" | null;
  status: "active" | "trial" | "cancelled" | "past_due" | "inactive";
};

function SettingsPageClient() {
  const [user, setUser] = useState<UserData | null>(null);
  const [subscription, setSubscription] = useState<PlaygroundSubscriptionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/me", { credentials: "include" });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    fetch("/api/v1/me/playground-usage", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json().catch(() => null)) as PlaygroundSubscriptionSnapshot | null;
      })
      .then((data) => {
        if (!data) {
          setSubscription(null);
          return;
        }
        setSubscription({
          plan: data.plan ?? null,
          status: data.status ?? "inactive",
        });
      })
      .catch(() => setSubscription(null));
  }, []);

  const isEphemeral = !user?.isPermanent && (user?.accountType === "agent" || user?.accountType === "human");
  const hasActivePlan = subscription?.status === "active" || subscription?.status === "trial";
  const subscriptionLabel = hasActivePlan
    ? subscription?.plan === "trial"
      ? "Trial Active"
      : "Plan Active"
    : null;
  const mergeSignUpHref = buildUpgradeAuthUrl(
    "signup",
    user?.accountType ?? null,
    "/dashboard/settings"
  );
  const mergeSignInHref = buildUpgradeAuthUrl(
    "signin",
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
          <p className="text-sm text-[var(--text-secondary)]">Loadingâ€¦</p>
        ) : user ? (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Name
              </p>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {user.name || "â€”"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Email
              </p>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {user.email || "â€”"}
              </p>
            </div>
            {isEphemeral && (
              <div className="space-y-2">
                <p className="text-xs text-amber-400">
                  {user?.accountType === "agent"
                    ? "You're using a temporary play account. Create a permanent account to keep your API key and credits."
                    : "You're using a guest account. Create a permanent account to save your progress."}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Link your email below, or sign in/create an account to merge this temporary account.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            Unable to load profile.
          </p>
        )}
      </GlassCard>

      {/* Link email — for temporary/guest accounts */}
      {isEphemeral && (
        <LinkEmailSection
          onLinked={refreshUser}
          mergeSignInHref={mergeSignInHref}
          mergeSignUpHref={mergeSignUpHref}
        />
      )}

      {/* Change password â€” only for email/password accounts */}
      {(user?.isPermanent || user?.accountType === "email") && <ChangePasswordSection />}

      {/* Signal Preferences */}
      <SignalPreferencesSection />

      {/* API Key */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          API Key
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Use this key for authenticated API requests.
        </p>
        <ApiKeySection />
        <Link
          href="/docs"
          className="inline-block text-xs font-medium text-[var(--accent-heart)] hover:underline"
        >
          Full API docs â†’
        </Link>
      </div>

      {/* Sign out â€” unified route clears guest, agent, and NextAuth */}
      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Account
        </h2>
        {subscriptionLabel ? (
          <div className="mb-4 inline-flex items-center rounded-full border border-cyan-300/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-100">
            {subscriptionLabel}
          </div>
        ) : null}
        <Link
          href="/api/v1/signout"
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




