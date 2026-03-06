"use client";

import { useCallback, useState } from "react";

type MarketingFeature = {
  title: string;
  description: string;
  tag: string;
  priority?: "high" | "medium" | "low";
};

type PricingTier = {
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  highlight?: boolean;
  cta: string;
};

type FaqItem = {
  question: string;
  answer: string;
};

type DemoTab = "generate" | "plan" | "debug";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  );
}

const PRICING_TIERS: PricingTier[] = [
  {
    name: "Starter",
    monthlyPrice: 2,
    yearlyPrice: 20,
    description: "For side projects and lightweight coding help.",
    features: ["2-day trial included", "Core workflows (plan, generate, debug)", "Standard usage limits", "IDE context support"],
    cta: "Start 2-day trial",
  },
  {
    name: "Builder",
    monthlyPrice: 5,
    yearlyPrice: 50,
    description: "For daily coding with more headroom and insights.",
    features: ["2-day trial included", "Higher usage limits", "Priority capacity", "Usage insights", "IDE indexing"],
    highlight: true,
    cta: "Start 2-day trial",
  },
  {
    name: "Studio",
    monthlyPrice: 10,
    yearlyPrice: 100,
    description: "For heavy sessions and team-ready support.",
    features: ["2-day trial included", "Highest usage limits", "Priority capacity", "Direct support", "Team workflows"],
    cta: "Start 2-day trial",
  },
];

const EXTENSION_FEATURES: MarketingFeature[] = [
  {
    title: "Auto mode",
    description: "Stay in flow—Playground selects the best workflow for the task.",
    tag: "Momentum",
    priority: "high",
  },
  {
    title: "Plan mode",
    description: "Step-by-step plans before edits so changes land cleanly.",
    tag: "Less rework",
    priority: "high",
  },
  {
    title: "Full access (YOLO)",
    description: "High-speed execution when you want maximal velocity.",
    tag: "Rapid",
    priority: "high",
  },
  {
    title: "IDE context",
    description: "Understands your active files, selection, and workspace state.",
    tag: "Context-aware",
    priority: "medium",
  },
  {
    title: "Indexing",
    description: "Repo-aware retrieval for safer refactors and architecture work.",
    tag: "Repo intelligence",
    priority: "medium",
  },
  {
    title: "History",
    description: "Pick up where you left off—sessions and outputs stay connected.",
    tag: "Memory",
    priority: "medium",
  },
  {
    title: "Multiple agents",
    description: "Run planner/implementer/reviewer loops in parallel.",
    tag: "Parallel",
    priority: "medium",
  },
  {
    title: "Image inputs",
    description: "Attach screenshots and mockups for UI debugging and workflows.",
    tag: "Multimodal",
    priority: "low",
  },
  {
    title: "Long context",
    description: "Handle large diffs and long threads without dropping key details.",
    tag: "Deep context",
    priority: "high",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is Playground a wrapper around another model?",
    answer:
      "No—Playground 1 is our in-house model, plus Xpersona orchestration like sessions, indexing, and policy checks.",
  },
  {
    question: "Can I keep using ChatGPT / Claude / Codex?",
    answer: "Yes. Playground complements your existing workflow, especially inside VS Code.",
  },
  {
    question: "How does execution safety work?",
    answer: "Actions are policy-checked, with preview/approval controls depending on your mode and settings.",
  },
  {
    question: "Will it work on large repos?",
    answer: "Yes—long context plus optional indexing for repo-aware help.",
  },
  {
    question: "How do I cancel?",
    answer: "Cancel anytime in the dashboard before the trial ends.",
  },
];

const DEMO_CONTENT: Record<DemoTab, { title: string; caption: string; code: string }> = {
  generate: {
    title: "Generate",
    caption: "Create production-ready code with clear constraints.",
    code: `// Generate a secure API route\nconst endpoint = await playground.generate({\n  task: \"Create a POST /api/invoice endpoint\",\n  language: \"typescript\",\n  constraints: [\"zod validation\", \"auth guard\", \"rate limit\"]\n});`,
  },
  plan: {
    title: "Plan",
    caption: "Break complex features into executable steps.",
    code: `// Plan a feature end-to-end\nconst plan = await playground.plan({\n  goal: \"Ship multi-agent review workflow\",\n  output: \"milestones + acceptance tests\"\n});\n\nconsole.log(plan.steps);`,
  },
  debug: {
    title: "Debug",
    caption: "Resolve defects faster with context-aware analysis.",
    code: `// Debug with full IDE context\nconst fix = await playground.debug({\n  error: \"Hydration mismatch on dashboard\",\n  includeOpenFiles: true,\n  includeRecentChanges: true\n});`,
  },
};

function fireAnalyticsEvent(eventName: string, payload?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (gtag) gtag("event", eventName, payload ?? {});
}

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-[var(--light-border)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--light-text-tertiary)] shadow-[var(--light-shadow-sm)]">
      {children}
    </p>
  );
}

function HeroSection({
  onStartTrial,
  onSeeDemo,
  isBusy,
}: {
  onStartTrial: () => void;
  onSeeDemo: () => void;
  isBusy: boolean;
}) {
  return (
    <section className="relative overflow-hidden pt-10 sm:pt-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.22),rgba(124,58,237,0.12),transparent_60%)] blur-2xl" />
        <div className="absolute right-[-120px] top-24 h-64 w-64 rounded-full bg-[rgba(37,99,235,0.10)] blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-16 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SectionKicker>
              <SparklesIcon className="h-4 w-4 text-[var(--light-accent)]" />
              Playground AI • VS Code extension
            </SectionKicker>
          </div>

          <h1 className="mt-5 text-balance text-4xl font-black leading-tight text-[var(--light-text-primary)] sm:text-5xl lg:text-6xl">
            Your agentic coding workspace in VS Code.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-[var(--light-text-secondary)] sm:text-lg">
            Plan, generate, and debug with full project context—then execute changes with policy-checked control. Powered by{" "}
            <span className="font-semibold text-[var(--light-text-primary)]">Playground 1</span>, our in-house coding model.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                fireAnalyticsEvent("playground_hero_cta_click", { location: "hero", action: "start_trial" });
                onStartTrial();
              }}
              disabled={isBusy}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--light-accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/15 transition hover:bg-[var(--light-accent-hover)] hover:shadow-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isBusy ? "Starting checkout..." : "Start 2-day trial"}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                fireAnalyticsEvent("playground_hero_cta_click", { location: "hero", action: "see_demo" });
                onSeeDemo();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--light-border)] bg-white px-6 py-3 text-sm font-semibold text-[var(--light-text-primary)] shadow-[var(--light-shadow-sm)] transition hover:border-[var(--light-border-strong)] hover:bg-[var(--light-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2"
            >
              See the demo
            </button>
          </div>

          <p className="mt-3 text-sm text-[var(--light-text-tertiary)]">
            Card required. Cancel before day 3 to avoid charges.
          </p>
        </div>

        <div className="relative rounded-3xl border border-[var(--light-border)] bg-white p-6 shadow-[var(--light-shadow-xl)]">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-2 text-xs text-[var(--light-text-tertiary)]">playground.config.ts</span>
          </div>
          <div className="space-y-2 rounded-2xl border border-[var(--light-border)] bg-[var(--light-bg-secondary)] p-4 font-mono text-xs text-[var(--light-text-primary)] sm:text-sm">
            <p className="text-[var(--light-text-secondary)]">{"// plan → generate → debug → execute"}</p>
            <p>{"const agent = playground.createAgent({"}</p>
            <p className="pl-4 text-[var(--light-text-secondary)]">
              mode: <span className="font-semibold text-[var(--light-accent)]">&quot;plan&quot;</span>,
            </p>
            <p className="pl-4 text-[var(--light-text-secondary)]">
              ideContext: <span className="font-semibold text-[var(--light-accent)]">true</span>,
            </p>
            <p className="pl-4 text-[var(--light-text-secondary)]">
              indexing: <span className="font-semibold text-[var(--light-accent)]">&quot;optional&quot;</span>,
            </p>
            <p className="pl-4 text-[var(--light-text-secondary)]">
              policy: <span className="font-semibold text-[var(--light-accent)]">&quot;preview_first&quot;</span>,
            </p>
            <p>{"});"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function WhatYouGetRail() {
  const items = [
    { label: "Modes", value: "Auto, Plan, Full access" },
    { label: "Context", value: "Active file + selection + workspace" },
    { label: "Indexing", value: "Repo-aware retrieval for refactors" },
    { label: "Control", value: "Preview-first execution policies" },
  ];

  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-3 md:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-[var(--light-border)] bg-white p-4 shadow-[var(--light-shadow-card)]"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--light-text-tertiary)]">{item.label}</div>
            <div className="mt-2 text-sm font-semibold text-[var(--light-text-primary)]">{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureGridSection() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black text-[var(--light-text-primary)] sm:text-4xl">Built for real codebases.</h2>
        <p className="mt-3 max-w-3xl text-[var(--light-text-secondary)]">Less context switching. More shipped code.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {EXTENSION_FEATURES.map((feature) => (
            <article
              key={feature.title}
              className={`rounded-2xl border border-[var(--light-border)] bg-white p-5 shadow-[var(--light-shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--light-shadow-card-hover)] ${
                feature.priority === "high" ? "ring-1 ring-[var(--light-accent-light)]" : ""
              }`}
            >
              <div className="inline-flex rounded-full bg-[var(--light-accent-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--light-accent-text)]">
                {feature.tag}
              </div>
              <h3 className="mt-3 text-lg font-bold text-[var(--light-text-primary)]">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--light-text-secondary)]">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  const [activeTab, setActiveTab] = useState<DemoTab>("plan");
  const content = DEMO_CONTENT[activeTab];

  return (
    <section id="playground-demo" className="scroll-mt-24 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-3xl border border-[var(--light-border)] bg-white p-6 shadow-[var(--light-shadow-lg)] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionKicker>Interactive demo</SectionKicker>
            <h2 className="mt-4 text-3xl font-black text-[var(--light-text-primary)] sm:text-4xl">
              See the loop: plan → generate → debug
            </h2>
            <p className="mt-3 text-[var(--light-text-secondary)]">{content.caption}</p>
          </div>

          <div className="flex rounded-2xl border border-[var(--light-border)] bg-[var(--light-bg-secondary)] p-1" role="tablist" aria-label="Playground demo tabs">
            {(["plan", "generate", "debug"] as DemoTab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2 ${
                  activeTab === tab ? "bg-[var(--light-accent)] text-white shadow-sm" : "text-[var(--light-text-secondary)] hover:text-[var(--light-text-primary)]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-900/10 bg-slate-950 p-5">
          <p className="mb-3 text-sm font-semibold text-slate-200">{content.title}</p>
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-100 sm:text-sm">{content.code}</pre>
        </div>
      </div>
    </section>
  );
}

function PricingCard({
  tier,
  isYearly,
  onStartTrial,
  isBusy,
}: {
  tier: PricingTier;
  isYearly: boolean;
  onStartTrial: (tier: "starter" | "builder" | "studio") => void;
  isBusy: boolean;
}) {
  const monthly = isYearly ? Math.round(tier.yearlyPrice / 12) : tier.monthlyPrice;
  const tierKey = tier.name.toLowerCase() as "starter" | "builder" | "studio";

  return (
    <article
      className={`relative rounded-3xl border p-6 shadow-[var(--light-shadow-card)] transition hover:shadow-[var(--light-shadow-card-hover)] ${
        tier.highlight
          ? "border-[var(--light-accent)] bg-[linear-gradient(180deg,rgba(37,99,235,0.06),rgba(124,58,237,0.03))]"
          : "border-[var(--light-border)] bg-white"
      }`}
    >
      {tier.highlight ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--light-accent)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
          Most chosen
        </div>
      ) : null}

      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--light-text-tertiary)]">{tier.name}</div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-4xl font-black text-[var(--light-text-primary)]">${monthly}</span>
        <span className="pb-1 text-sm text-[var(--light-text-tertiary)]">/mo</span>
      </div>
      {isYearly ? (
        <p className="mt-1 text-xs text-[var(--light-text-secondary)]">${tier.yearlyPrice}/yr billed annually</p>
      ) : null}

      <p className="mt-3 text-sm text-[var(--light-text-secondary)]">{tier.description}</p>
      <ul className="mt-5 space-y-2">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-[var(--light-text-secondary)]">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--light-accent)]" />
            {feature}
          </li>
        ))}
      </ul>

      <button
        onClick={() => {
          fireAnalyticsEvent("playground_plan_cta_click", { plan_name: tierKey });
          onStartTrial(tierKey);
        }}
        disabled={isBusy}
        className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 ${
          tier.highlight
            ? "bg-[var(--light-accent)] text-white hover:bg-[var(--light-accent-hover)]"
            : "border border-[var(--light-border)] bg-white text-[var(--light-text-primary)] hover:border-[var(--light-border-strong)] hover:bg-[var(--light-bg-hover)]"
        }`}
      >
        {tier.cta}
        <ArrowRightIcon className="h-4 w-4" />
      </button>
    </article>
  );
}

function PricingSection({
  isYearly,
  setIsYearly,
  onStartTrial,
  isBusy,
}: {
  isYearly: boolean;
  setIsYearly: (value: boolean) => void;
  onStartTrial: (tier: "starter" | "builder" | "studio") => void;
  isBusy: boolean;
}) {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-black text-[var(--light-text-primary)] sm:text-4xl">Pricing</h2>
            <p className="mt-2 text-[var(--light-text-secondary)]">Start with a 2-day trial, then scale up as your usage grows.</p>
          </div>

          <div className="rounded-full border border-[var(--light-border)] bg-[var(--light-bg-secondary)] p-1 shadow-[var(--light-shadow-sm)]">
            <button
              aria-label="Switch to monthly billing"
              onClick={() => {
                setIsYearly(false);
                fireAnalyticsEvent("playground_pricing_toggle_change", { billing: "monthly", section: "pricing" });
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                !isYearly ? "bg-[var(--light-accent)] text-white" : "text-[var(--light-text-secondary)] hover:text-[var(--light-text-primary)]"
              }`}
            >
              Monthly
            </button>
            <button
              aria-label="Switch to yearly billing"
              onClick={() => {
                setIsYearly(true);
                fireAnalyticsEvent("playground_pricing_toggle_change", { billing: "yearly", section: "pricing" });
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isYearly ? "bg-[var(--light-accent)] text-white" : "text-[var(--light-text-secondary)] hover:text-[var(--light-text-primary)]"
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <PricingCard key={tier.name} tier={tier} isYearly={isYearly} onStartTrial={onStartTrial} isBusy={isBusy} />
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--light-border)] bg-[var(--light-bg-secondary)] p-4 text-sm text-[var(--light-text-secondary)]">
          Exact usage limits are shown at checkout and in your dashboard, and may change as we tune capacity.
        </div>

        <p className="mt-4 text-center text-sm text-[var(--light-text-tertiary)]">Card required. Cancel before day 3 to avoid charges.</p>
      </div>
    </section>
  );
}

function UseCasesSection({ onStartTrial }: { onStartTrial: () => void }) {
  const cards = [
    {
      title: "Solo developer",
      body: "Ship side projects faster with plan-first coding and tight feedback loops.",
    },
    {
      title: "Startup team",
      body: "Stay aligned with shared context, indexing, and repeatable workflows.",
    },
    {
      title: "Agency / consultancy",
      body: "Move across client codebases quickly while keeping changes safe and consistent.",
    },
  ];

  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black text-[var(--light-text-primary)] sm:text-4xl">Built for every team shape</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {cards.map((card) => (
            <article
              key={card.title}
              className="rounded-3xl border border-[var(--light-border)] bg-white p-6 shadow-[var(--light-shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--light-shadow-card-hover)]"
            >
              <h3 className="text-lg font-bold text-[var(--light-text-primary)]">{card.title}</h3>
              <p className="mt-2 text-sm text-[var(--light-text-secondary)]">{card.body}</p>
              <button
                onClick={onStartTrial}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--light-accent)] transition hover:text-[var(--light-accent-hover)]"
              >
                Start trial
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-3xl font-black text-[var(--light-text-primary)] sm:text-4xl">FAQ</h2>
        <div className="mt-6 space-y-3">
          {FAQ_ITEMS.map((item, index) => (
            <div key={item.question} className="rounded-2xl border border-[var(--light-border)] bg-white shadow-[var(--light-shadow-sm)]">
              <button
                onClick={() => setOpenIndex(openIndex === index ? -1 : index)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-sm font-semibold text-[var(--light-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2"
              >
                {item.question}
                <span className="text-[var(--light-text-tertiary)]">{openIndex === index ? "–" : "+"}</span>
              </button>
              {openIndex === index ? (
                <p className="px-4 pb-4 text-sm text-[var(--light-text-secondary)]">{item.answer}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection({ onStartTrial, isBusy }: { onStartTrial: () => void; isBusy: boolean }) {
  return (
    <section className="px-4 pb-24 pt-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--light-border)] bg-[linear-gradient(135deg,rgba(37,99,235,0.10),rgba(124,58,237,0.06),white_65%)] p-8 text-center shadow-[var(--light-shadow-xl)] sm:p-10">
          <h2 className="text-3xl font-black text-[var(--light-text-primary)] sm:text-4xl">Start your trial. Ship something today.</h2>
          <p className="mt-3 text-[var(--light-text-secondary)]">
            Plan, generate, and debug with IDE context—then execute with policy-checked control.
          </p>
          <button
            onClick={() => {
              fireAnalyticsEvent("playground_final_cta_click", { location: "final_section" });
              onStartTrial();
            }}
            disabled={isBusy}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[var(--light-accent)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/15 transition hover:bg-[var(--light-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isBusy ? "Starting checkout..." : "Start 2-day trial"}
            <ArrowRightIcon className="h-4 w-4" />
          </button>
          <p className="mt-3 text-sm text-[var(--light-text-tertiary)]">Card required. Cancel before day 3 to avoid charges.</p>
        </div>
      </div>
    </section>
  );
}

export function PlaygroundClient() {
  const [isYearly, setIsYearly] = useState(false);
  const [isCheckoutStarting, setIsCheckoutStarting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const scrollToDemo = useCallback(() => {
    document.getElementById("playground-demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const startCheckout = useCallback(
    async (tier: "starter" | "builder" | "studio") => {
      if (isCheckoutStarting) return;
      setIsCheckoutStarting(true);
      setCheckoutError(null);
      try {
        const res = await fetch("/api/v1/me/playground-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tier, billing: isYearly ? "yearly" : "monthly" }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { url?: string };
          error?: string;
          message?: string;
        };

        if (res.status === 401) {
          window.location.href = "/api/auth/play";
          return;
        }

        if (!res.ok || !json.success || !json.data?.url) {
          setCheckoutError(json.message || "Could not start checkout. Please try again.");
          return;
        }

        window.location.href = json.data.url;
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
      <HeroSection onStartTrial={() => startCheckout("builder")} onSeeDemo={scrollToDemo} isBusy={isCheckoutStarting} />
      <WhatYouGetRail />

      {checkoutError ? (
        <div className="mx-auto mt-4 max-w-6xl px-4 text-sm text-red-600 sm:px-6">{checkoutError}</div>
      ) : null}

      <FeatureGridSection />
      <DemoSection />
      <PricingSection isYearly={isYearly} setIsYearly={setIsYearly} onStartTrial={startCheckout} isBusy={isCheckoutStarting} />
      <UseCasesSection onStartTrial={() => startCheckout("builder")} />
      <FaqSection />
      <FinalCtaSection onStartTrial={() => startCheckout("builder")} isBusy={isCheckoutStarting} />

      <div className="fixed bottom-4 left-0 right-0 z-40 px-4 pb-[env(safe-area-inset-bottom)] sm:hidden">
        <button
          onClick={() => {
            fireAnalyticsEvent("playground_hero_cta_click", { location: "sticky_mobile", action: "start_trial" });
            startCheckout("builder");
          }}
          disabled={isCheckoutStarting}
          className="w-full rounded-2xl bg-[var(--light-accent)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--light-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isCheckoutStarting ? "Starting checkout..." : "Start 2-day trial"}
        </button>
      </div>
    </div>
  );
}
