"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type RevealState =
  | { status: "cancelled" }
  | { status: "missing_session" }
  | { status: "loading" }
  | { status: "processing" }
  | {
      status: "revealed";
      apiKey: string;
      keyPrefix: string | null;
      credits: number;
      packageId: string | null;
      copied: boolean;
    }
  | {
      status: "top_up";
      keyPrefix: string | null;
      credits: number;
      packageId: string | null;
    }
  | { status: "already_revealed" }
  | { status: "error"; message: string };

type Props = {
  checkout: string | undefined;
  sessionId: string | undefined;
};

export default function RevealPanel({ checkout, sessionId }: Props) {
  const [state, setState] = useState<RevealState>(() => {
    if (checkout === "cancelled") return { status: "cancelled" };
    if (!sessionId) return { status: "missing_session" };
    return { status: "loading" };
  });

  const packageLabel = useMemo(() => {
    if (state.status !== "revealed" && state.status !== "top_up") return null;
    return state.packageId ? state.packageId[0]?.toUpperCase() + state.packageId.slice(1) : null;
  }, [state]);

  const reveal = useCallback(async () => {
    if (!sessionId) return;

    const res = await fetch("/api/v1/crawl-license/reveal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ sessionId }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: {
        state?: "revealed" | "top_up";
        apiKey?: string;
        keyPrefix?: string | null;
        credits?: number;
        packageId?: string | null;
        message?: string;
      };
      error?: {
        code?: string;
        message?: string;
      };
    };

    if (res.status === 202) {
      setState({ status: "processing" });
      window.setTimeout(() => {
        void reveal();
      }, 2000);
      return;
    }

    if (res.status === 409) {
      setState({ status: "already_revealed" });
      return;
    }

    if (!res.ok) {
      setState({
        status: "error",
        message: body.error?.message ?? "We could not retrieve the crawl license key for this checkout.",
      });
      return;
    }

    if (body.data?.state === "revealed" && typeof body.data.apiKey === "string") {
      setState({
        status: "revealed",
        apiKey: body.data.apiKey,
        keyPrefix: body.data.keyPrefix ?? null,
        credits: body.data.credits ?? 0,
        packageId: body.data.packageId ?? null,
        copied: false,
      });
      return;
    }

    setState({
      status: "top_up",
      keyPrefix: body.data?.keyPrefix ?? null,
      credits: body.data?.credits ?? 0,
      packageId: body.data?.packageId ?? null,
    });
  }, [sessionId]);

  useEffect(() => {
    if (state.status !== "loading") return;
    void reveal();
  }, [reveal, state.status]);

  async function copyApiKey(apiKey: string) {
    try {
      await navigator.clipboard.writeText(apiKey);
      setState((current) =>
        current.status === "revealed" ? { ...current, copied: true } : current
      );
    } catch {}
  }

  let heading = "Payment received";
  let body: ReactNode = null;

  if (state.status === "cancelled") {
    heading = "Checkout cancelled";
    body = (
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
        No charge was completed. You can restart checkout whenever you are ready.
      </p>
    );
  } else if (state.status === "missing_session") {
    body = (
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
        We did not receive a Stripe session id, so there is nothing to reveal here yet.
      </p>
    );
  } else if (state.status === "loading" || state.status === "processing") {
    body = (
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
        {state.status === "loading"
          ? "We are retrieving your crawl license details now."
          : "Payment is confirmed. We are finishing crawl license provisioning and will reveal your key in a moment."}
      </p>
    );
  } else if (state.status === "revealed") {
    body = (
      <>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
          Your first crawl license key is ready. This raw key is shown once on this page, so save it now.
        </p>
        <div className="mt-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">API Key</p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950/80 px-4 py-4 text-sm text-cyan-100">
            {state.apiKey}
          </pre>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
            <span>{state.credits.toLocaleString()} credits added</span>
            {packageLabel ? <span>{packageLabel} package</span> : null}
            {state.keyPrefix ? <span>Prefix: {state.keyPrefix}</span> : null}
          </div>
          <button
            type="button"
            onClick={() => void copyApiKey(state.apiKey)}
            className="mt-4 rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            {state.copied ? "Copied" : "Copy API key"}
          </button>
        </div>
        <div className="mt-6 rounded-2xl bg-black/20 px-4 py-4 text-sm leading-7 text-[var(--text-secondary)]">
          Exchange the API key at <code>/api/v1/crawl-license</code> to get a short-lived crawl token,
          then use that token on premium crawl requests.
        </div>
      </>
    );
  } else if (state.status === "top_up") {
    body = (
      <>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
          This checkout topped up an existing crawl license, so no new API key was issued.
        </p>
        <div className="mt-6 rounded-2xl bg-black/20 px-4 py-4 text-sm leading-7 text-[var(--text-secondary)]">
          <div>{state.credits.toLocaleString()} credits added.</div>
          {packageLabel ? <div>{packageLabel} package.</div> : null}
          {state.keyPrefix ? <div>Continue using your existing key with prefix {state.keyPrefix}.</div> : null}
        </div>
      </>
    );
  } else if (state.status === "already_revealed") {
    body = (
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
        This checkout session has already revealed its API key once. If you lost it before storing it,
        you will need a manual reset in v1.
      </p>
    );
  } else {
    body = (
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
        {state.message}
      </p>
    );
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-white/10 bg-[var(--bg-card)] p-8 shadow-2xl shadow-black/20">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-secondary)]">
          Crawl License
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{heading}</h1>
        {body}
        {sessionId ? (
          <p className="mt-4 rounded-2xl bg-black/20 px-4 py-3 text-xs text-[var(--text-secondary)]">
            Stripe session: {sessionId}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/api/v1/crawl-license"
            className="rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            View crawl docs
          </Link>
          <Link
            href="/for-agents"
            className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-white/30"
          >
            Back to machine docs
          </Link>
        </div>
      </div>
    </main>
  );
}
