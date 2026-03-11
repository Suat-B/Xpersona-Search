"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

type PricingTierKey = "starter" | "builder" | "studio";
type DemoTab = "plan" | "generate" | "debug";

type PricingTier = {
  key: PricingTierKey;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  bestFor: string;
  description: string;
  features: string[];
  highlight?: boolean;
};

type FaqItem = {
  question: string;
  answer: string;
};

const PRICING_TIERS: PricingTier[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyPrice: 2,
    yearlyPrice: 20,
    bestFor: "Best for side projects",
    description: "A fast onramp for focused coding sessions with plan, generate, and debug.",
    features: ["2-day trial", "Core workflows", "Standard usage limits", "All IDE's Supported"],
  },
  {
    key: "builder",
    name: "Builder",
    monthlyPrice: 5,
    yearlyPrice: 50,
    bestFor: "Best for daily shipping",
    description: "The most popular tier for teams and solo builders who live in their repo.",
    features: ["2-day trial", "Higher usage limits", "Priority capacity", "Usage insights", "Repo indexing"],
    highlight: true,
  },
  {
    key: "studio",
    name: "Studio",
    monthlyPrice: 10,
    yearlyPrice: 100,
    bestFor: "Best for heavy sessions",
    description: "Maximum capacity for demanding workflows and high-context implementation loops.",
    features: ["2-day trial", "Highest usage limits", "Priority capacity", "Direct support", "Team workflows"],
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I still use ChatGPT, Claude, or Codex?",
    answer: "Yes. Playground complements your workflow in VS Code, especially for plan to execute loops in real repos.",
  },
  {
    question: "How does execution safety work?",
    answer: "Actions are policy-checked with preview and approval controls based on your selected mode and settings.",
  },
  {
    question: "Will this work on larger repositories?",
    answer: "Yes. Playground is designed for long-context work and optional indexing for repo-aware retrieval.",
  },
  {
    question: "How do billing and cancellation work?",
    answer: "Every plan starts with a 2-day trial. You can cancel in your dashboard before day 3 to avoid charges.",
  },
];

const DEMO_CONTENT: Record<
  DemoTab,
  {
    eyebrow: string;
    title: string;
    caption: string;
    points: string[];
    code: string;
  }
> = {
  plan: {
    eyebrow: "Plan mode",
    title: "Think before edit, so refactors land cleanly.",
    caption: "Turn a feature request into implementation steps with acceptance tests.",
    points: ["Milestones before mutation", "Risks surfaced early", "Clear acceptance criteria"],
    code: `const plan = await playground.plan({\n  goal: "Ship account audit logs",\n  output: "milestones + tests",\n  constraints: ["no schema drift", "backward compatible API"]\n});`,
  },
  generate: {
    eyebrow: "Generate mode",
    title: "Ship code that matches your repo constraints.",
    caption: "Generate production-ready patches with validation and auth guardrails.",
    points: ["Repo-aware generation", "Architecture alignment", "Less rewrite overhead"],
    code: `const patch = await playground.generate({\n  task: "Add POST /api/invoice",\n  language: "typescript",\n  constraints: ["zod", "auth guard", "rate limit"]\n});`,
  },
  debug: {
    eyebrow: "Debug mode",
    title: "Resolve bugs faster with full IDE context.",
    caption: "Use open files and recent changes to isolate root causes faster.",
    points: ["Open-file context", "Change-aware analysis", "Reviewable fixes"],
    code: `const fix = await playground.debug({\n  issue: "Hydration mismatch on dashboard",\n  includeOpenFiles: true,\n  includeRecentChanges: true\n});`,
  },
};

function fireAnalyticsEvent(eventName: string, payload?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (gtag) gtag("event", eventName, payload ?? {});
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Hero({ onStartTrial, isBusy }: { onStartTrial: () => void; isBusy: boolean }) {
  return (
    <section className="relative overflow-hidden bg-[var(--light-bg-primary)] px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="playground-reveal space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--light-accent-text)] shadow-[var(--light-shadow-sm)] backdrop-blur">
            Playground AI for your IDE
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--light-accent)]/25 bg-[var(--light-accent-light)] px-3 py-1 text-xs font-semibold text-[var(--light-accent-text)]">
            Most people start with Builder
          </div>
          <h1 className="text-balance text-4xl font-black leading-[1.05] text-[var(--light-text-primary)] sm:text-5xl lg:text-6xl">
            Introducing Playground 1 ❤️
          </h1>
          <p className="max-w-2xl text-pretty text-base leading-relaxed text-[var(--light-text-secondary)] sm:text-lg">
            Trained in America. Benchmarks the same as Kimi K2.5 and Gemini 3 Flash. ❤️ Playground plans, writes,
            debugs, and executes in your real repo. Less context switching. More shipped features. Made in America ❤️
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                fireAnalyticsEvent("playground_hero_cta_click", { location: "hero", action: "start_trial" });
                onStartTrial();
              }}
              disabled={isBusy}
              className="playground-cta-glow inline-flex items-center gap-2 rounded-2xl bg-[var(--light-accent)] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--light-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isBusy ? "Starting checkout..." : "Start 2-day trial"}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
            <Link
              href="/chat"
              onClick={() => {
                fireAnalyticsEvent("playground_hero_cta_click", { location: "hero", action: "chat" });
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--light-border-strong)] bg-white/70 px-6 py-3.5 text-sm font-semibold text-[var(--light-text-primary)] backdrop-blur transition hover:border-[var(--light-accent)]/40 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2"
            >
              See how it works
            </Link>
            <a
              href="https://marketplace.visualstudio.com/items?itemName=playgroundai.xpersona-playground"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                fireAnalyticsEvent("playground_hero_cta_click", { location: "hero", action: "ide_extension" });
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--light-accent)]/30 bg-[var(--light-accent-light)] px-6 py-3.5 text-sm font-semibold text-[var(--light-accent-text)] transition hover:border-[var(--light-accent)]/50 hover:bg-[var(--light-accent-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2"
            >
              IDE Extension {"<3"}
            </a>
          </div>
          <p className="text-sm text-[var(--light-text-tertiary)]">Card required. Cancel before day 3 to avoid charges.</p>
        </div>

        <div className="playground-reveal delay-150">
          <div className="playground-panel rounded-3xl p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <span className="text-xs font-medium text-[var(--light-text-tertiary)]">workspace.xpersona.ts</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="playground-glass rounded-2xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--light-text-tertiary)]">Planner</p>
                <p className="mt-2 text-sm font-semibold text-[var(--light-text-primary)]">Break auth migration into safe milestones.</p>
                <ul className="mt-3 space-y-2 text-xs text-[var(--light-text-secondary)]">
                  <li>1. Audit routes and edge cases</li>
                  <li>2. Add schema validation and tests</li>
                  <li>3. Execute patch with guardrails</li>
                </ul>
              </div>
              <div className="playground-glass rounded-2xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--light-text-tertiary)]">Execution</p>
                <p className="mt-2 text-sm font-semibold text-[var(--light-text-primary)]">Proposed patch ready for approval.</p>
                <div className="mt-3 space-y-2 text-xs text-[var(--light-text-secondary)]">
                  <p>+ auth middleware update</p>
                  <p>+ route-level rate limits</p>
                  <p>+ rollback-safe migration notes</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Plan", "Generate", "Debug", "Execute", "Indexed"].map((pill) => (
                <span key={pill} className="rounded-full border border-[var(--light-accent)]/30 bg-[var(--light-accent-light)] px-2.5 py-1 text-[11px] font-semibold text-[var(--light-accent-text)]">
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProofStrip() {
  const items = ["Build with full project context", "Plan before edits", "Parallel coding loops", "Policy-checked execution", "2-day paid trial"];
  return (
    <section className="px-4 py-5 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <div key={item} className="playground-glass rounded-2xl px-4 py-3 text-sm font-semibold text-[var(--light-text-primary)]">{item}</div>
        ))}
      </div>
    </section>
  );
}

function Differentiators() {
  const pillars = [
    {
      title: "Thinks before it edits",
      body: "Plan-first workflow reduces rework and keeps your team aligned before any patch is applied.",
      points: ["Milestones before mutation", "Edge cases surfaced early", "Cleaner implementation handoff"],
    },
    {
      title: "Sees your repo, not just prompts",
      body: "Playground reads active context and optional index data to produce code that fits your system.",
      points: ["Open file awareness", "Long-context reasoning", "Architecture-aware suggestions"],
    },
    {
      title: "Moves fast without losing control",
      body: "Switch between careful review and rapid execution while keeping policy checks in the loop.",
      points: ["Preview-first by default", "Mode-based control", "Safer high-velocity workflows"],
    },
  ];

  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-balance text-3xl font-black text-[var(--light-text-primary)] sm:text-4xl">Why this feels different from generic coding assistants</h2>
        <p className="mt-3 max-w-3xl text-[var(--light-text-secondary)]">Playground is designed for shipping in real codebases, not just generating snippets.</p>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {pillars.map((pillar) => (
            <article key={pillar.title} className="playground-panel rounded-3xl p-6">
              <h3 className="text-xl font-black text-[var(--light-text-primary)]">{pillar.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--light-text-secondary)]">{pillar.body}</p>
              <ul className="mt-5 space-y-2">
                {pillar.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-[var(--light-text-secondary)]">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--light-accent)]" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Showcase() {
  const [activeTab, setActiveTab] = useState<DemoTab>("plan");
  const content = DEMO_CONTENT[activeTab];

  return (
    <section id="playground-demo" className="scroll-mt-24 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-3xl border border-[var(--light-border)] bg-white/75 p-6 shadow-[var(--light-shadow-lg)] backdrop-blur sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--light-border)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--light-text-tertiary)]">Product showcase</p>
            <h2 className="mt-4 text-balance text-3xl font-black text-[var(--light-text-primary)] sm:text-4xl">Watch the loop: plan, generate, debug, then execute</h2>
          </div>
          <div className="rounded-2xl border border-[var(--light-border)] bg-[var(--light-bg-secondary)] p-1" role="tablist" aria-label="Showcase tabs">
            {(["plan", "generate", "debug"] as DemoTab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => {
                  setActiveTab(tab);
                  fireAnalyticsEvent("playground_showcase_tab_change", { tab });
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition ${
                  activeTab === tab ? "bg-[var(--light-accent)] text-white" : "text-[var(--light-text-secondary)] hover:text-[var(--light-text-primary)]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="playground-glass rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--light-text-tertiary)]">{content.eyebrow}</p>
            <h3 className="mt-2 text-2xl font-black text-[var(--light-text-primary)]">{content.title}</h3>
            <p className="mt-3 text-sm text-[var(--light-text-secondary)]">{content.caption}</p>
            <ul className="mt-5 space-y-2">
              {content.points.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-[var(--light-text-secondary)]">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--light-accent)]" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-900/10 bg-slate-950 p-5 shadow-[var(--light-shadow-xl)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">playground.session.ts</p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-100 sm:text-sm">{content.code}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing({ isYearly, setIsYearly, onStartTrial, isBusy }: {
  isYearly: boolean;
  setIsYearly: (value: boolean) => void;
  onStartTrial: (tier: PricingTierKey) => void;
  isBusy: boolean;
}) {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-black text-[var(--light-text-primary)] sm:text-4xl">Get an automatic AI coding agent for your IDE</h2>
            <p className="mt-2 text-[var(--light-text-secondary)]">Every plan starts with a 2-day trial. Builder is the most popular for daily shipping.</p>
          </div>
          <div className="rounded-full border border-[var(--light-border)] bg-white/80 p-1 shadow-[var(--light-shadow-sm)]">
            <button
              onClick={() => {
                setIsYearly(false);
                fireAnalyticsEvent("playground_pricing_toggle_change", { billing: "monthly", section: "pricing" });
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                !isYearly ? "bg-[var(--light-accent)] text-white" : "text-[var(--light-text-secondary)] hover:text-[var(--light-text-primary)]"
              }`}
              aria-label="Switch to monthly billing"
            >
              Monthly
            </button>
            <button
              onClick={() => {
                setIsYearly(true);
                fireAnalyticsEvent("playground_pricing_toggle_change", { billing: "yearly", section: "pricing" });
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isYearly ? "bg-[var(--light-accent)] text-white" : "text-[var(--light-text-secondary)] hover:text-[var(--light-text-primary)]"
              }`}
              aria-label="Switch to yearly billing"
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PRICING_TIERS.map((tier) => {
            const monthly = isYearly ? Math.round(tier.yearlyPrice / 12) : tier.monthlyPrice;
            return (
              <article
                key={tier.key}
                className={`relative rounded-3xl border p-6 transition ${
                  tier.highlight
                    ? "playground-glow-border scale-[1.01] border-[var(--light-accent)] bg-[linear-gradient(165deg,rgba(37,99,235,0.10),rgba(14,165,233,0.08),rgba(255,255,255,0.96))] shadow-[var(--light-shadow-xl)]"
                    : "border-[var(--light-border)] bg-white/90 shadow-[var(--light-shadow-card)]"
                }`}
              >
                {tier.highlight ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--light-accent)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">Most chosen</div>
                ) : null}
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--light-text-tertiary)]">{tier.name}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--light-accent-text)]">{tier.bestFor}</p>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-4xl font-black text-[var(--light-text-primary)]">${monthly}</span>
                  <span className="pb-1 text-sm text-[var(--light-text-tertiary)]">/mo</span>
                </div>
                {isYearly ? <p className="mt-1 text-xs text-[var(--light-text-secondary)]">${tier.yearlyPrice}/yr billed annually</p> : null}
                <p className="mt-3 text-sm text-[var(--light-text-secondary)]">{tier.description}</p>
                <ul className="mt-5 space-y-2">
                  {tier.features.map((feature) => {
                    const isUsageLimitFeature = feature.toLowerCase().includes("usage limits");
                    return (
                      <li key={feature} className="flex items-start gap-2 text-sm text-[var(--light-text-secondary)]">
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--light-accent)]" />
                        <span className={isUsageLimitFeature ? "font-bold text-[var(--light-text-primary)]" : undefined}>{feature}</span>
                      </li>
                    );
                  })}
                </ul>
                <button
                  onClick={() => {
                    fireAnalyticsEvent("playground_plan_cta_click", { plan_name: tier.key });
                    onStartTrial(tier.key);
                  }}
                  disabled={isBusy}
                  className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 ${
                    tier.highlight
                      ? "playground-cta-glow bg-[var(--light-accent)] text-white hover:bg-[var(--light-accent-hover)]"
                      : "border border-[var(--light-border)] bg-white text-[var(--light-text-primary)] hover:border-[var(--light-border-strong)] hover:bg-[var(--light-bg-hover)]"
                  }`}
                >
                  {isBusy ? "Starting checkout..." : "Start 2-day trial"}
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
              </article>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--light-border)] bg-white/80 p-4 text-sm text-[var(--light-text-secondary)]">
          <span className="font-bold text-[var(--light-text-primary)]">Exact usage limits</span> appear at checkout and in your dashboard and may change as capacity is tuned.
        </div>
      </div>
    </section>
  );
}

function TrustAndFaq() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <h2 className="text-3xl font-black text-[var(--light-text-primary)]">Speed with guardrails</h2>
          {[
            "Controlled execution with policy checks",
            "Works with your current workflow",
            "Cancel before day 3 to avoid charges",
          ].map((item) => (
            <div key={item} className="playground-glass rounded-2xl p-4 text-sm font-semibold text-[var(--light-text-primary)]">{item}</div>
          ))}
        </div>
        <div>
          <h2 className="text-3xl font-black text-[var(--light-text-primary)]">FAQ</h2>
          <div className="mt-5 space-y-3">
            {FAQ_ITEMS.map((item, index) => (
              <article key={item.question} className="rounded-2xl border border-[var(--light-border)] bg-white/85 shadow-[var(--light-shadow-sm)]">
                <button
                  onClick={() => setOpenIndex(openIndex === index ? -1 : index)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-sm font-semibold text-[var(--light-text-primary)]"
                >
                  {item.question}
                  <span className="text-base text-[var(--light-text-tertiary)]">{openIndex === index ? "-" : "+"}</span>
                </button>
                {openIndex === index ? <p className="px-4 pb-4 text-sm text-[var(--light-text-secondary)]">{item.answer}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta({ onStartTrial, isBusy }: { onStartTrial: () => void; isBusy: boolean }) {
  return (
    <section className="px-4 pb-24 pt-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--light-border)] bg-[var(--light-bg-primary)] p-8 text-center shadow-[var(--light-shadow-xl)] sm:p-12">
          <div className="relative">
            <h2 className="text-balance text-3xl font-black text-[var(--light-text-primary)] sm:text-5xl">Start your trial and ship your next feature today</h2>
            <p className="mx-auto mt-4 max-w-2xl text-[var(--light-text-secondary)]">Plan, generate, debug, and execute from one workspace built for real repositories.</p>
            <button
              onClick={() => {
                fireAnalyticsEvent("playground_final_cta_click", { location: "final_section" });
                onStartTrial();
              }}
              disabled={isBusy}
              className="playground-cta-glow mt-7 inline-flex items-center gap-2 rounded-2xl bg-[var(--light-accent)] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--light-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isBusy ? "Starting checkout..." : "Start 2-day trial"}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
            <p className="mt-3 text-sm text-[var(--light-text-tertiary)]">Card required. Cancel before day 3 to avoid charges.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PlaygroundClient() {
  const [isYearly, setIsYearly] = useState(false);
  const [isCheckoutStarting, setIsCheckoutStarting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const startCheckout = useCallback(
    async (tier: PricingTierKey) => {
      if (isCheckoutStarting) return;
      setIsCheckoutStarting(true);
      setCheckoutError(null);
      try {
        const runCheckout = async (allowAuthRetry: boolean) => {
          const res = await fetch("/api/v1/me/playground-checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ tier, billing: isYearly ? "yearly" : "monthly" }),
          });
          const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { url?: string }; message?: string };

          if (res.status === 401 && allowAuthRetry) {
            const authRes = await fetch("/api/auth/play", { method: "POST", credentials: "include" });
            if (!authRes.ok) {
              setCheckoutError("Sign in failed. Please try again.");
              return;
            }
            await runCheckout(false);
            return;
          }

          if (!res.ok || !json.success || !json.data?.url) {
            setCheckoutError(json.message || "Could not start checkout. Please try again.");
            return;
          }

          window.location.href = json.data.url;
        };

        await runCheckout(true);
      } catch {
        setCheckoutError("Could not start checkout. Please try again.");
      } finally {
        setIsCheckoutStarting(false);
      }
    },
    [isCheckoutStarting, isYearly],
  );

  return (
    <div
      className="light-mode light-theme relative left-1/2 right-1/2 w-screen -ml-[50vw] -mr-[50vw] overflow-x-hidden bg-[var(--light-bg-primary)] text-[var(--light-text-primary)]"
      style={{ colorScheme: "light" }}
    >
      <Hero onStartTrial={() => startCheckout("builder")} isBusy={isCheckoutStarting} />
      <Pricing isYearly={isYearly} setIsYearly={setIsYearly} onStartTrial={startCheckout} isBusy={isCheckoutStarting} />
      <ProofStrip />
      {checkoutError ? <div className="mx-auto max-w-6xl px-4 text-sm text-red-600 sm:px-6">{checkoutError}</div> : null}
      <Differentiators />
      <Showcase />
      <TrustAndFaq />
      <FinalCta onStartTrial={() => startCheckout("builder")} isBusy={isCheckoutStarting} />

      <div className="fixed bottom-4 left-0 right-0 z-40 px-4 pb-[env(safe-area-inset-bottom)] sm:hidden">
        <button
          onClick={() => {
            fireAnalyticsEvent("playground_hero_cta_click", { location: "sticky_mobile", action: "start_trial" });
            startCheckout("builder");
          }}
          disabled={isCheckoutStarting}
          className="playground-cta-glow w-full rounded-2xl bg-[var(--light-accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isCheckoutStarting ? "Starting checkout..." : "Start 2-day trial"}
        </button>
      </div>
    </div>
  );
}

