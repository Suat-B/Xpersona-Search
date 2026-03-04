"use client";

import { useCallback, useMemo, useState } from "react";
import { BenchmarkCharts } from "@/components/playground/BenchmarkCharts";

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
    description: "Great for learning, side-projects, and lightweight coding help (300 requests/month).",
    features: [
      "2-day free trial",
      "Trial quota: 30 requests/day, 8K context, 256 max output",
      "Paid package: 300 requests/month",
      "Paid limits begin after trial",
      "Core coding workflows",
    ],
    cta: "Start 2-Day Trial",
  },
  {
    name: "Builder",
    monthlyPrice: 5,
    yearlyPrice: 50,
    description: "Best for active developers shipping weekly (1,000 requests/month).",
    features: [
      "2-day free trial",
      "Trial quota: 30 requests/day, 8K context, 256 max output",
      "Paid package: 1,000 requests/month",
      "Paid limits begin after trial",
      "Priority capacity",
      "Usage insights",
    ],
    highlight: true,
    cta: "Start 2-Day Trial",
  },
  {
    name: "Studio",
    monthlyPrice: 10,
    yearlyPrice: 100,
    description: "For advanced users and teams running heavy coding sessions (3,000 requests/month).",
    features: [
      "2-day free trial",
      "Trial quota: 30 requests/day, 8K context, 256 max output",
      "Paid package: 3,000 requests/month",
      "Paid limits begin after trial",
      "Highest capacity",
      "Direct support",
    ],
    cta: "Start 2-Day Trial",
  },
];

const EXTENSION_FEATURES: MarketingFeature[] = [
  {
    title: "Auto Mode",
    description: "Automatically picks the best workflow for each task so you can keep momentum.",
    tag: "Hands-free",
    priority: "high",
  },
  {
    title: "Plan Mode",
    description: "Creates step-by-step execution plans before coding to reduce mistakes and rework.",
    tag: "Structured",
    priority: "high",
  },
  {
    title: "YOLO Mode",
    description: "High-speed execution for fast prototyping when you want maximal velocity.",
    tag: "Rapid",
    priority: "high",
  },
  {
    title: "IDE Context",
    description: "Understands your active files, selected code, and workspace state in real time.",
    tag: "Context-aware",
    priority: "medium",
  },
  {
    title: "IDE Indexing",
    description: "Indexes the repo for deeper code-aware answers, safer refactors, and architecture help.",
    tag: "Repo intelligence",
    priority: "medium",
  },
  {
    title: "History",
    description: "Reopen prior chats, prompts, and outputs to continue work without losing flow.",
    tag: "Memory",
    priority: "medium",
  },
  {
    title: "Multiple Agents",
    description: "Run specialized agents in parallel for planning, implementation, and review.",
    tag: "Parallel",
    priority: "medium",
  },
  {
    title: "Add image",
    description: "Attach screenshots and mockups for UI debugging and multimodal prompt workflows.",
    tag: "Multimodal",
    priority: "low",
  },
  {
    title: "262,144 context window",
    description: "Handle huge files and long-running sessions without dropping important context.",
    tag: "Long context",
    priority: "high",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is this powered by your own model or a third-party wrapper?",
    answer:
      "Our Playground experience is powered by our own in-house model, Playground <3 pure love <3, built for coding speed, context depth, and reliable execution in VS Code.",
  },
  {
    question: "Will this fit my workflow if I already use ChatGPT or Claude Code?",
    answer:
      "Yes. Playground is designed to feel familiar while adding stronger in-editor workflows and team-ready controls.",
  },
  {
    question: "How fast can I start?",
    answer:
      "Most users can start in under five minutes. Begin the 2-day trial, connect your editor, and run your first prompt.",
  },
  {
    question: "Do I need to switch tools?",
    answer:
      "No. You can keep your current workflow and layer Playground into your existing VS Code setup.",
  },
  {
    question: "Can it handle large repositories and long threads?",
    answer:
      "Yes. Playground is built for deep context with support for a 262,144 context window and indexed workspace assistance.",
  },
];

const DEMO_CONTENT: Record<DemoTab, { title: string; caption: string; code: string }> = {
  generate: {
    title: "Generate",
    caption: "Create production-ready code with clear constraints.",
    code: `// Generate a secure API route\nconst endpoint = await playground.generate({\n  task: "Create a POST /api/invoice endpoint",\n  language: "typescript",\n  constraints: ["zod validation", "auth guard", "rate limit"]\n});`,
  },
  plan: {
    title: "Plan",
    caption: "Break complex features into executable steps.",
    code: `// Plan a feature end-to-end\nconst plan = await playground.plan({\n  goal: "Ship multi-agent review workflow",\n  output: "milestones + acceptance tests"\n});\n\nconsole.log(plan.steps);`,
  },
  debug: {
    title: "Debug",
    caption: "Resolve defects faster with context-aware analysis.",
    code: `// Debug with full IDE context\nconst fix = await playground.debug({\n  error: "Hydration mismatch on dashboard",\n  includeOpenFiles: true,\n  includeRecentChanges: true\n});`,
  },
};

function fireAnalyticsEvent(eventName: string, payload?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (gtag) {
    gtag("event", eventName, payload ?? {});
  }
}

function HeroSection({ onStartTrial }: { onStartTrial: () => void }) {
  return (
    <section className="relative overflow-hidden px-4 pb-14 pt-14 sm:px-6 lg:pt-20">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute -left-24 top-8 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-0 top-20 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
      </div>
      <div className="relative mx-auto grid max-w-6xl gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-slate-900/70 px-4 py-1.5 text-xs font-semibold text-cyan-200">
            <SparklesIcon className="h-3.5 w-3.5" />
            Powered by our in-house model: Playground
          </div>
          <h1 className="text-balance text-4xl font-black leading-tight text-black sm:text-5xl lg:text-6xl">
            Your coding copilot workspace for shipping faster.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
            Built for developers who use ChatGPT, Codex, and Claude Code, but want stronger in-editor execution and
            planning powered by Playground, our in-house model {"<3 pure love <3"}.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                fireAnalyticsEvent("playground_hero_cta_click", { location: "hero", action: "start_trial" });
                onStartTrial();
              }}
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_35px_rgba(34,211,238,0.35)] transition hover:translate-y-[-1px] hover:shadow-[0_20px_45px_rgba(59,130,246,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              Start 2-Day Trial
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button className="inline-flex items-center rounded-xl border border-slate-600 bg-slate-900/70 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
              See It In VS Code
            </button>
          </div>
          <p className="mt-3 text-sm text-emerald-300">2-day trial with card required. Auto-charge starts on day 3 unless canceled before trial ends.</p>
        </div>

        <div className="relative rounded-3xl border border-slate-700 bg-slate-900/80 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.65)] backdrop-blur">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-2 text-xs text-slate-400">assistant-session.ts</span>
          </div>
          <div className="space-y-2 font-mono text-xs sm:text-sm">
            <p className="text-cyan-300">{"// plan + generate + ship"}</p>
            <p className="text-slate-200">const agent = playground.createAgent({'{'}</p>
            <p className="pl-4 text-slate-400">mode: <span className="text-emerald-300">&quot;plan&quot;</span>,</p>
            <p className="pl-4 text-slate-400">contextWindow: <span className="text-emerald-300">262144</span>,</p>
            <p className="pl-4 text-slate-400">ideContext: <span className="text-emerald-300">true</span></p>
            <p className="text-slate-200">{'}'});</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustRail() {
  const items = [
    { label: "Reliability", value: "99.9% uptime SLA" },
    { label: "Latency", value: "~50ms avg response" },
    { label: "Developers", value: "10K+ active builders" },
    { label: "Model", value: "In-house Playground <3 pure love <3" },
  ];

  return (
    <section className="px-4 py-4 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PricingCard({
  tier,
  isYearly,
  compact = false,
  onStartTrial,
  isBusy,
}: {
  tier: PricingTier;
  isYearly: boolean;
  compact?: boolean;
  onStartTrial: (tier: "starter" | "builder" | "studio") => void;
  isBusy: boolean;
}) {
  const monthly = isYearly ? Math.round(tier.yearlyPrice / 12) : tier.monthlyPrice;
  const tierKey = tier.name.toLowerCase() as "starter" | "builder" | "studio";

  return (
    <article
      className={`relative rounded-2xl border p-5 transition ${
        tier.highlight
          ? "border-cyan-300/70 bg-slate-900 shadow-[0_14px_45px_rgba(14,165,233,0.25)]"
          : "border-slate-700 bg-slate-900/70"
      }`}
    >
      {tier.highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-300 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-900">
          Most Chosen
        </div>
      )}
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{tier.name}</div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-4xl font-black text-white">${monthly}</span>
        <span className="pb-1 text-sm text-slate-400">/mo</span>
      </div>
      {isYearly && <p className="mt-1 text-xs text-emerald-300">${tier.yearlyPrice}/yr billed annually</p>}
      <p className="mt-3 text-sm text-slate-300">{tier.description}</p>
      {!compact && (
        <ul className="mt-4 space-y-2">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-slate-300">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              {feature}
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => {
          fireAnalyticsEvent("playground_plan_cta_click", { plan_name: tier.name.toLowerCase() });
          onStartTrial(tierKey);
        }}
        disabled={isBusy}
        className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
          tier.highlight
            ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950"
            : "border border-slate-600 bg-slate-800 text-slate-100 hover:border-cyan-300"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {tier.cta}
        <ArrowRightIcon className="h-4 w-4" />
      </button>
    </article>
  );
}

function PricingPreviewSection({
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
    <section className="px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Pricing Preview</p>
            <h2 className="mt-2 text-3xl font-black text-black sm:text-4xl">Start small, scale as you ship</h2>
            <p className="mt-2 max-w-2xl text-slate-300">Pricing is visible early so your team can evaluate fit quickly.</p>
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-900 p-1">
            <button
              aria-label="Switch to monthly billing"
              onClick={() => {
                setIsYearly(false);
                fireAnalyticsEvent("playground_pricing_toggle_change", { billing: "monthly", section: "preview" });
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                !isYearly ? "bg-cyan-300 text-slate-950" : "text-slate-300"
              }`}
            >
              Monthly
            </button>
            <button
              aria-label="Switch to yearly billing"
              onClick={() => {
                setIsYearly(true);
                fireAnalyticsEvent("playground_pricing_toggle_change", { billing: "yearly", section: "preview" });
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                isYearly ? "bg-cyan-300 text-slate-950" : "text-slate-300"
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <PricingCard key={`preview-${tier.name}`} tier={tier} isYearly={isYearly} compact onStartTrial={onStartTrial} isBusy={isBusy} />
          ))}
        </div>

        <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
          <p className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">All plans include usage on our in-house Playground model.</p>
          <p className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">Paid packages: Starter 300/mo, Builder 1,000/mo, Studio 3,000/mo requests.</p>
          <p className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">Trial starts in seconds. Credit card required.</p>
          <p className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">Trial quota: 30/day, 8K context, 256 max output. Paid: 16K context, 512 max output.</p>
        </div>
      </div>
    </section>
  );
}

function FeatureGridSection() {
  return (
    <section className="px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black text-black sm:text-4xl">VS Code extension features that convert work into shipped code</h2>
        <p className="mt-3 max-w-3xl text-slate-300">Everything below is built to reduce context switching and increase trial-to-paid retention.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {EXTENSION_FEATURES.map((feature) => (
            <article
              key={feature.title}
              className={`rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/70 ${
                feature.priority === "high"
                  ? "border-cyan-400/50 bg-gradient-to-b from-slate-900 to-slate-900/80"
                  : "border-slate-700 bg-slate-900/70"
              }`}
            >
              <div className="inline-flex rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
                {feature.tag}
              </div>
              <h3 className="mt-3 text-lg font-bold text-black">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  const [activeTab, setActiveTab] = useState<DemoTab>("generate");
  const content = DEMO_CONTENT[activeTab];

  return (
    <section className="px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-3xl border border-slate-700 bg-slate-900/70 p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-300">Interactive Demo</p>
            <h2 className="mt-2 text-3xl font-black text-black sm:text-4xl">Generate, plan, and debug in one flow</h2>
          </div>
          <div className="flex rounded-xl border border-slate-700 bg-slate-950/60 p-1" role="tablist" aria-label="Playground demo tabs">
            {(["generate", "plan", "debug"] as DemoTab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  activeTab === tab ? "bg-cyan-300 text-slate-950" : "text-slate-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-slate-300">{content.caption}</p>
        <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950 p-5">
          <p className="mb-3 text-sm font-semibold text-cyan-300">{content.title}</p>
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-200 sm:text-sm">{content.code}</pre>
        </div>
      </div>
    </section>
  );
}

function UseCasesSection({ onStartTrial }: { onStartTrial: () => void }) {
  const cards = [
    {
      title: "Solo Developer",
      body: "Ship side projects and client work faster with plan-first coding and tight feedback loops.",
    },
    {
      title: "Startup Team",
      body: "Coordinate multiple contributors with shared context, indexed repos, and reusable history.",
    },
    {
      title: "Agency / Consultancy",
      body: "Move across client codebases quickly while maintaining consistency and delivery velocity.",
    },
  ];

  return (
    <section className="px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black text-black sm:text-4xl">Built for every team shape</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {cards.map((card) => (
            <article key={card.title} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
              <h3 className="text-lg font-bold text-black">{card.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{card.body}</p>
              <button onClick={onStartTrial} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 transition hover:text-cyan-200">
                Start Free Trial
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
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
    <section className="px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-black text-black sm:text-4xl">Full pricing and plan details</h2>
          <p className="mt-2 text-slate-300">Choose the plan that matches your coding throughput today.</p>
        </div>
        <div className="mb-8 flex justify-center">
          <div className="rounded-full border border-slate-700 bg-slate-900 p-1">
            <button
              aria-label="Switch full pricing to monthly"
              onClick={() => {
                setIsYearly(false);
                fireAnalyticsEvent("playground_pricing_toggle_change", { billing: "monthly", section: "full" });
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                !isYearly ? "bg-cyan-300 text-slate-950" : "text-slate-300"
              }`}
            >
              Monthly
            </button>
            <button
              aria-label="Switch full pricing to yearly"
              onClick={() => {
                setIsYearly(true);
                fireAnalyticsEvent("playground_pricing_toggle_change", { billing: "yearly", section: "full" });
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                isYearly ? "bg-cyan-300 text-slate-950" : "text-slate-300"
              }`}
            >
              Yearly
            </button>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <PricingCard key={`full-${tier.name}`} tier={tier} isYearly={isYearly} onStartTrial={onStartTrial} isBusy={isBusy} />
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-emerald-300">2-day trial for every plan. Card required now, auto-charge starts on day 3 unless canceled.</p>
      </div>
    </section>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-black text-black sm:text-4xl">Common objections, answered</h2>
        <div className="mt-6 space-y-3">
          {FAQ_ITEMS.map((item, index) => (
            <div key={item.question} className="rounded-xl border border-slate-700 bg-slate-900/70">
              <button
                onClick={() => setOpenIndex(openIndex === index ? -1 : index)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {item.question}
                <span className="text-cyan-300">{openIndex === index ? "-" : "+"}</span>
              </button>
              {openIndex === index && <p className="px-4 pb-4 text-sm text-slate-300">{item.answer}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection({ onStartTrial, isBusy }: { onStartTrial: () => void; isBusy: boolean }) {
  return (
    <section className="px-4 pb-24 pt-12 sm:px-6">
      <div className="mx-auto max-w-4xl rounded-3xl border border-cyan-400/30 bg-gradient-to-r from-slate-900 to-slate-800 p-8 text-center shadow-[0_20px_60px_rgba(8,145,178,0.25)]">
        <h2 className="text-3xl font-black text-black sm:text-4xl">Ready to turn prompts into shipped features?</h2>
        <p className="mt-3 text-slate-300">Start your 2-day trial with our in-house model Playground {"<3 pure love <3"} and keep your existing workflow intact.</p>
        <button
          onClick={() => {
            fireAnalyticsEvent("playground_final_cta_click", { location: "final_section" });
            onStartTrial();
          }}
          disabled={isBusy}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-7 py-3.5 text-sm font-bold text-slate-950 transition hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Start 2-Day Trial
          <ArrowRightIcon className="h-4 w-4" />
        </button>
        <p className="mt-3 text-sm text-emerald-300">Card required at signup. You are charged on day 3 unless canceled during the trial.</p>
      </div>
    </section>
  );
}

export function PlaygroundClient() {
  const [isYearly, setIsYearly] = useState(false);
  const [isCheckoutStarting, setIsCheckoutStarting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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

  const backgroundStyle = useMemo(
    () => ({
      background: "#ffffff",
    }),
    [],
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden text-slate-100" style={backgroundStyle}>
      <HeroSection onStartTrial={() => startCheckout("builder")} />
      <TrustRail />
      <PricingPreviewSection isYearly={isYearly} setIsYearly={setIsYearly} onStartTrial={startCheckout} isBusy={isCheckoutStarting} />
      {checkoutError ? (
        <div className="mx-auto mt-4 max-w-6xl px-4 text-sm text-rose-300 sm:px-6">{checkoutError}</div>
      ) : null}
      <FeatureGridSection />
      <DemoSection />
      <BenchmarkCharts />
      <UseCasesSection onStartTrial={() => startCheckout("builder")} />
      <PricingSection isYearly={isYearly} setIsYearly={setIsYearly} onStartTrial={startCheckout} isBusy={isCheckoutStarting} />
      <FaqSection />
      <FinalCtaSection onStartTrial={() => startCheckout("builder")} isBusy={isCheckoutStarting} />

      <div className="fixed bottom-4 left-0 right-0 z-40 px-4 sm:hidden">
        <button
          onClick={() => {
            fireAnalyticsEvent("playground_hero_cta_click", { location: "sticky_mobile", action: "start_trial" });
            startCheckout("builder");
          }}
          disabled={isCheckoutStarting}
          className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_35px_rgba(56,189,248,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {isCheckoutStarting ? "Starting checkout..." : "Start 2-Day Trial"}
        </button>
      </div>
    </div>
  );
}
