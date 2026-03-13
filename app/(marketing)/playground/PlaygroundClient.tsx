"use client";

import { useState } from "react";
import Link from "next/link";
import {
  firePlaygroundAnalyticsEvent,
  type PlaygroundPricingTier,
  useResolvedPlaygroundMarketing,
} from "@/components/playground/PlaygroundMarketingProvider";

type WorkflowTab = "plan" | "generate" | "debug" | "execute";

type PricingTier = {
  key: PlaygroundPricingTier;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  bestFor: string;
  description: string;
  features: string[];
  highlight?: boolean;
};

type WorkflowItem = {
  eyebrow: string;
  title: string;
  description: string;
  checklist: string[];
  artifactLabel: string;
  artifactTitle: string;
  artifactCopy: string;
  code: string;
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
    description: "A quick onramp for focused coding sessions with plan, generate, and debug.",
    features: ["2-day trial", "Core workflows", "Standard usage limits", "All IDE's Supported"],
  },
  {
    key: "builder",
    name: "Builder",
    monthlyPrice: 5,
    yearlyPrice: 50,
    bestFor: "Best for daily shipping",
    description: "The sweet spot for solo builders and teams who want a coding agent in the repo every day.",
    features: ["2-day trial", "Higher usage limits", "Priority capacity", "Usage insights", "Repo indexing"],
    highlight: true,
  },
  {
    key: "studio",
    name: "Studio",
    monthlyPrice: 10,
    yearlyPrice: 100,
    bestFor: "Best for heavy sessions",
    description: "Maximum capacity for long-context implementation loops, reviews, and high-volume sessions.",
    features: ["2-day trial", "Highest usage limits", "Priority capacity", "Direct support", "Team workflows"],
  },
];

const PROOF_ITEMS = [
  { title: "Repo-aware patches", caption: "Open files plus optional index context." },
  { title: "Plan before edits", caption: "Milestones, risks, and acceptance criteria up front." },
  { title: "Approval modes", caption: "Move carefully or move fast with guardrails." },
  { title: "VS Code first", caption: "Built for the place where your code already lives." },
  { title: "2-day paid trial", caption: "Card required. Cancel before day 3 to avoid charges." },
];

const WORKFLOW_ITEMS: Record<WorkflowTab, WorkflowItem> = {
  plan: {
    eyebrow: "Plan mode",
    title: "Turn a vague request into an implementation brief you can actually trust.",
    description:
      "Playground starts by shaping the work: milestones, risks, acceptance criteria, and where the patch should land.",
    checklist: ["Break work into reviewable steps", "Surface compatibility risks early", "Write success criteria before mutation"],
    artifactLabel: "Deliverable",
    artifactTitle: "Milestone plan ready for approval",
    artifactCopy: "A clean handoff for you or the agent to execute next.",
    code: `const plan = await playground.plan({
  goal: "Ship audit logs for sensitive account actions",
  output: "milestones + tests + rollout notes",
  constraints: ["backward compatible API", "no schema drift"]
});`,
  },
  generate: {
    eyebrow: "Generate mode",
    title: "Draft patches that match the repo instead of fighting it.",
    description:
      "Use your current files, project conventions, and indexed context to generate code that feels like it belongs.",
    checklist: ["Read the surrounding system first", "Generate reviewable changesets", "Respect auth, validation, and rate-limit patterns"],
    artifactLabel: "Patch preview",
    artifactTitle: "Repo-aware implementation draft",
    artifactCopy: "The diff is ready to inspect before anything risky happens.",
    code: `const patch = await playground.generate({
  task: "Add POST /api/invoice",
  language: "typescript",
  constraints: ["zod", "auth guard", "rate limit", "vitest"]
});`,
  },
  debug: {
    eyebrow: "Debug mode",
    title: "Use open files and recent changes to isolate bugs faster.",
    description:
      "Playground can work from the clues you already have instead of making you restate the entire repo every time.",
    checklist: ["Pull in recent edits and open files", "Trace root cause before suggesting fixes", "Keep repair options reviewable"],
    artifactLabel: "Debug note",
    artifactTitle: "Root cause narrowed to one surface",
    artifactCopy: "Fewer mystery fixes. More deliberate repair loops.",
    code: `const fix = await playground.debug({
  issue: "Hydration mismatch on dashboard",
  includeOpenFiles: true,
  includeRecentChanges: true
});`,
  },
  execute: {
    eyebrow: "Execute mode",
    title: "Ship with approvals, policy checks, and fewer sweaty manual loops.",
    description:
      "When you are ready, Playground can move from plan to action while still keeping your review settings in charge.",
    checklist: ["Preview risky actions before execution", "Apply policy checks automatically", "Keep the loop tight when the fix is obvious"],
    artifactLabel: "Run status",
    artifactTitle: "Execution queued with approvals in place",
    artifactCopy: "Fast enough to feel magical. Controlled enough to trust.",
    code: `const run = await playground.execute({
  mode: "reviewed",
  approvals: "required-for-destructive-actions",
  task: "Apply patch and run targeted tests"
});`,
  },
};

const COMPARISON_ROWS = [
  {
    label: "How work starts",
    generic: "One giant prompt and a lot of hope.",
    playground: "Plan-first flow with milestones, risks, and acceptance criteria.",
  },
  {
    label: "How code gets written",
    generic: "Snippet help with limited repo awareness.",
    playground: "Repo-aware patches built from your active context and optional index.",
  },
  {
    label: "How bugs get fixed",
    generic: "Restate the issue from scratch each time.",
    playground: "Pull open files and recent changes into the debugging loop.",
  },
  {
    label: "How risky actions are handled",
    generic: "Manual babysitting and copy-paste review.",
    playground: "Mode-based control with approvals and policy checks.",
  },
  {
    label: "What you are left with",
    generic: "A reply.",
    playground: "A workflow: plan, generate, debug, then execute.",
  },
];

const SAFETY_NOTES = [
  "Use Playground next to ChatGPT, Claude, or Codex. It does not ask you to give up your stack.",
  "Approval modes let you decide when the agent can move and when it needs a human checkpoint.",
  "The checkout flow is still the same 2-day trial with card required and cancellation before day 3.",
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I still use ChatGPT, Claude, or Codex?",
    answer: "Yes. Playground fits beside them and shines when the work needs repo context, planning, or reviewable execution.",
  },
  {
    question: "How does execution safety work?",
    answer: "Actions are policy-checked and can be gated behind approval settings based on the mode you choose.",
  },
  {
    question: "Will this work on larger repositories?",
    answer: "Yes. Playground is built for longer-context coding sessions and can use index data when you want repo-aware retrieval.",
  },
  {
    question: "How do billing and cancellation work?",
    answer: "Every plan starts with a 2-day trial. Cancel in your dashboard before day 3 to avoid charges.",
  },
];

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

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l1.9 5.6L19.5 9l-5.6 1.4L12 16l-1.9-5.6L4.5 9l5.6-1.4L12 2z" />
    </svg>
  );
}

function HeroSection({
  onStartTrial,
  isBusy,
}: {
  onStartTrial: () => void;
  isBusy: boolean;
}) {
  return (
    <section className="px-4 pb-8 pt-8 sm:px-6 sm:pb-12 sm:pt-12">
      <div className="mx-auto grid max-w-[1260px] gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
        <div className="playground-editorial-reveal space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="playground-sticker playground-sticker-cobalt">Playground for Coding</span>
            <span className="playground-sticker playground-sticker-lime">2-day paid trial</span>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--playground-muted-strong)]">
              Repo-aware coding agent for your IDE
            </p>
            <h1 className="max-w-4xl text-balance text-5xl font-black leading-[0.95] tracking-[-0.06em] text-[var(--playground-ink)] sm:text-6xl xl:text-7xl">
              Plan the work. Patch the repo. Approve the risky stuff.
            </h1>
            <p className="max-w-2xl text-pretty text-lg leading-relaxed text-[var(--playground-muted)] sm:text-xl">
              Playground turns open-ended coding asks into clean milestones, repo-aware patches, and reviewable execution
              steps in one workspace built for shipping.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                firePlaygroundAnalyticsEvent("playground_hero_cta_click", { location: "hero", action: "start_trial" });
                onStartTrial();
              }}
              disabled={isBusy}
              className="playground-editorial-cta-primary"
            >
	              {isBusy ? "Starting checkout..." : "Start 2-day free trial"}
              <ArrowRightIcon className="h-4 w-4" />
            </button>

            <Link
              href="/chat"
              onClick={() => {
                firePlaygroundAnalyticsEvent("playground_hero_cta_click", { location: "hero", action: "chat" });
              }}
              className="playground-editorial-cta-secondary"
            >
              See it in Chat
            </Link>

            <a
              href="https://marketplace.visualstudio.com/items?itemName=playgroundai.xpersona-playground"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                firePlaygroundAnalyticsEvent("playground_hero_cta_click", { location: "hero", action: "ide_extension" });
              }}
              className="playground-editorial-cta-ghost"
            >
              Install VS Code extension
            </a>
          </div>

          <p className="text-sm font-medium text-[var(--playground-muted)]">
            Card required. Cancel before day 3 to avoid charges.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <article className="playground-paper-panel playground-paper-panel-mini">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">Modes</p>
              <p className="mt-2 text-sm font-semibold text-[var(--playground-ink)]">Plan, generate, debug, execute</p>
            </article>
            <article className="playground-paper-panel playground-paper-panel-mini">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">Context</p>
              <p className="mt-2 text-sm font-semibold text-[var(--playground-ink)]">Open files plus optional repo indexing</p>
            </article>
            <article className="playground-paper-panel playground-paper-panel-mini">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">Control</p>
              <p className="mt-2 text-sm font-semibold text-[var(--playground-ink)]">Approval paths built into the loop</p>
            </article>
          </div>
        </div>

        <div className="playground-editorial-reveal playground-editorial-reveal-delay">
          <div className="playground-collage">
            <article className="playground-paper-panel playground-paper-panel-lg">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">
                    Session brief
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--playground-ink)]">
                    Make the upload flow retry-safe without breaking the API.
                  </h2>
                </div>
                <span className="playground-sticker playground-sticker-coral">Builder pick</span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="playground-note-card">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--playground-muted-strong)]">
                    Step 01
                  </p>
                  <p className="mt-2 text-base font-semibold text-[var(--playground-ink)]">Map the edges before code moves.</p>
                  <ul className="mt-4 space-y-2 text-sm text-[var(--playground-muted)]">
                    <li>Audit route handlers and retry assumptions.</li>
                    <li>Write acceptance criteria for idempotency and status codes.</li>
                  </ul>
                </div>
                <div className="playground-note-card">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--playground-muted-strong)]">
                    Step 02
                  </p>
                  <p className="mt-2 text-base font-semibold text-[var(--playground-ink)]">Draft the patch with repo conventions intact.</p>
                  <ul className="mt-4 space-y-2 text-sm text-[var(--playground-muted)]">
                    <li>Use the project&apos;s validation and auth patterns.</li>
                    <li>Prepare focused tests before execution.</li>
                  </ul>
                </div>
              </div>
            </article>

            <article className="playground-paper-panel playground-floating-note playground-floating-note-left">
              <div className="flex items-center gap-2 text-[var(--playground-cobalt)]">
                <SparkIcon className="h-4 w-4" />
                <p className="text-[11px] font-black uppercase tracking-[0.18em]">Planner output</p>
              </div>
              <p className="mt-3 text-sm font-semibold text-[var(--playground-ink)]">
                Risks surfaced before mutation: retries, duplicate side effects, webhook replay safety.
              </p>
            </article>

            <article className="playground-code-board playground-floating-note playground-floating-note-right">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--playground-muted-strong)]">
                Patch preview
              </p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-[var(--playground-ink)]">{`+ add idempotency key guard
+ reuse zod schema
+ run targeted upload tests`}</pre>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckoutErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="px-4 pb-2 sm:px-6">
      <div className="mx-auto max-w-[1260px]">
        <div className="playground-error-banner">
          <p className="text-sm font-semibold">{message}</p>
          <button type="button" onClick={onDismiss} className="playground-error-dismiss" aria-label="Dismiss checkout error">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ProofStrip() {
  return (
    <section className="px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto grid max-w-[1260px] gap-3 md:grid-cols-2 xl:grid-cols-5">
        {PROOF_ITEMS.map((item) => (
          <article key={item.title} className="playground-proof-card">
            <p className="text-sm font-black text-[var(--playground-ink)]">{item.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--playground-muted)]">{item.caption}</p>
          </article>
        ))}
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
  onStartTrial: (tier: PlaygroundPricingTier) => void;
  isBusy: boolean;
}) {
  return (
    <section id="playground-pricing" className="px-4 py-14 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-[1260px]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="playground-section-eyebrow">Choose your tempo</p>
            <h2 className="mt-3 text-balance text-4xl font-black tracking-[-0.05em] text-[var(--playground-ink)] sm:text-5xl">
              Start small, then graduate into daily shipping.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[var(--playground-muted)]">
              Same core workflow, different capacity. Builder is the most popular plan for people who want Playground in the
              repo every day.
            </p>
          </div>

          <div className="playground-billing-toggle" role="group" aria-label="Billing cadence">
            <button
              type="button"
              onClick={() => {
                setIsYearly(false);
                firePlaygroundAnalyticsEvent("playground_pricing_toggle_change", { billing: "monthly", section: "pricing" });
              }}
              className={`playground-billing-toggle-button ${!isYearly ? "playground-billing-toggle-button-active" : ""}`}
              aria-label="Switch to monthly billing"
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => {
                setIsYearly(true);
                firePlaygroundAnalyticsEvent("playground_pricing_toggle_change", { billing: "yearly", section: "pricing" });
              }}
              className={`playground-billing-toggle-button ${isYearly ? "playground-billing-toggle-button-active" : ""}`}
              aria-label="Switch to yearly billing"
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {PRICING_TIERS.map((tier) => {
            const monthly = isYearly ? Math.round(tier.yearlyPrice / 12) : tier.monthlyPrice;

            return (
              <article
                key={tier.key}
                className={`playground-pricing-editorial-card ${tier.highlight ? "playground-pricing-editorial-card-highlight" : ""}`}
              >
                {tier.highlight ? <span className="playground-sticker playground-sticker-coral">Most chosen</span> : null}
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">{tier.name}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--playground-cobalt)]">{tier.bestFor}</p>
                <div className="mt-5 flex items-end gap-1">
                  <span className="text-5xl font-black tracking-[-0.06em] text-[var(--playground-ink)]">${monthly}</span>
                  <span className="pb-2 text-sm font-medium text-[var(--playground-muted)]">/mo</span>
                </div>
                <p className="mt-2 text-sm text-[var(--playground-muted)]">
                  {isYearly ? `$${tier.yearlyPrice}/yr billed annually` : "Billed monthly"}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-[var(--playground-muted)]">{tier.description}</p>

                <ul className="mt-6 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-[var(--playground-ink)]">
                      <span className="playground-check-pill">
                        <CheckIcon className="h-3.5 w-3.5" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => {
                    firePlaygroundAnalyticsEvent("playground_plan_cta_click", { plan_name: tier.key });
                    onStartTrial(tier.key);
                  }}
                  disabled={isBusy}
                  className={tier.highlight ? "playground-editorial-cta-primary mt-8 w-full justify-center" : "playground-editorial-cta-secondary mt-8 w-full justify-center"}
                >
                  {isBusy ? "Starting checkout..." : "Start 2-day free trial"}
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
              </article>
            );
          })}
        </div>

        <div className="mt-6 playground-inline-note">
          <span className="font-black text-[var(--playground-ink)]">Exact usage limits</span> show up at checkout and in your
          dashboard and may change as capacity is tuned.
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const [activeTab, setActiveTab] = useState<WorkflowTab>("plan");
  const content = WORKFLOW_ITEMS[activeTab];
  const panelId = `playground-workflow-panel-${activeTab}`;

  return (
    <section className="px-4 py-14 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-[1260px]">
        <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
          <div className="space-y-5">
            <div>
              <p className="playground-section-eyebrow">Workflow storyboard</p>
              <h2 className="mt-3 text-balance text-4xl font-black tracking-[-0.05em] text-[var(--playground-ink)] sm:text-5xl">
                One coding loop, four strong beats.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-[var(--playground-muted)]">
                Switch modes depending on whether you need a brief, a patch, a diagnosis, or a controlled execution run.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1" role="tablist" aria-label="Playground workflow tabs">
              {(Object.keys(WORKFLOW_ITEMS) as WorkflowTab[]).map((tab, index) => {
                const tabId = `playground-workflow-tab-${tab}`;
                const tabPanelId = `playground-workflow-panel-${tab}`;

                return (
                  <button
                    key={tab}
                    type="button"
                    id={tabId}
                    role="tab"
                    aria-selected={activeTab === tab}
                    aria-controls={tabPanelId}
                    onClick={() => {
                      setActiveTab(tab);
                      firePlaygroundAnalyticsEvent("playground_showcase_tab_change", { tab });
                    }}
                    className={`playground-mode-tab ${activeTab === tab ? "playground-mode-tab-active" : ""}`}
                  >
                    <span className="playground-mode-tab-index">0{index + 1}</span>
                    <span>
                      <span className="block text-left text-sm font-black uppercase tracking-[0.18em]">{tab}</span>
                      <span className="mt-2 block text-left text-sm leading-relaxed">
                        {tab === "plan" && "Shape the work before code changes."}
                        {tab === "generate" && "Draft repo-aware changesets."}
                        {tab === "debug" && "Use context to narrow root cause."}
                        {tab === "execute" && "Apply the approved work with guardrails."}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            id={panelId}
            className="playground-paper-panel playground-storyboard-panel"
            role="tabpanel"
            aria-labelledby={`playground-workflow-tab-${activeTab}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="playground-sticker playground-sticker-cobalt">{content.eyebrow}</span>
              <span className="playground-sticker playground-sticker-paper">Live in the repo</span>
            </div>

            <h3 className="mt-5 max-w-3xl text-balance text-3xl font-black tracking-[-0.05em] text-[var(--playground-ink)] sm:text-4xl">
              {content.title}
            </h3>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--playground-muted)]">{content.description}</p>

            <div className="mt-8 grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="playground-note-card">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">
                  {content.artifactLabel}
                </p>
                <h4 className="mt-2 text-xl font-black tracking-tight text-[var(--playground-ink)]">{content.artifactTitle}</h4>
                <p className="mt-3 text-sm leading-relaxed text-[var(--playground-muted)]">{content.artifactCopy}</p>
                <ul className="mt-5 space-y-3">
                  {content.checklist.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-[var(--playground-ink)]">
                      <span className="playground-check-pill">
                        <CheckIcon className="h-3.5 w-3.5" />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="playground-code-board">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">
                  playground.session.ts
                </p>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-[var(--playground-ink)] sm:text-sm">
                  {content.code}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ComparisonSection() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-[1260px]">
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-5">
            <div>
              <p className="playground-section-eyebrow">Why it hits different</p>
              <h2 className="mt-3 text-balance text-4xl font-black tracking-[-0.05em] text-[var(--playground-ink)] sm:text-5xl">
                Generic coding assistants stop at answers. Playground stays in the workflow.
              </h2>
            </div>

            <article className="playground-paper-panel">
              <p className="text-sm leading-relaxed text-[var(--playground-muted)]">
                You can still use your favorite model stack for ideation. Playground earns its keep when the work needs a
                real plan, repo context, and a safer path from &quot;idea&quot; to &quot;merged.&quot;
              </p>
            </article>

            <div className="grid gap-3 sm:grid-cols-2">
              <article className="playground-paper-panel playground-paper-panel-mini">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">Built for</p>
                <p className="mt-2 text-sm font-semibold text-[var(--playground-ink)]">Real codebases, review loops, and daily shipping</p>
              </article>
              <article className="playground-paper-panel playground-paper-panel-mini">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">Feels like</p>
                <p className="mt-2 text-sm font-semibold text-[var(--playground-ink)]">A staff engineer with better note taking</p>
              </article>
            </div>
          </div>

          <div className="playground-paper-panel overflow-hidden">
            <div className="hidden gap-4 border-b border-black/10 pb-4 md:grid md:grid-cols-[0.72fr_1fr_1fr]">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">Category</p>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">Generic assistant</p>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)]">Playground</p>
            </div>

            <div className="divide-y divide-black/10">
              {COMPARISON_ROWS.map((row) => (
                <div key={row.label} className="grid gap-4 py-5 md:grid-cols-[0.72fr_1fr_1fr]">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--playground-muted-strong)]">{row.label}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)] md:hidden">
                      Generic assistant
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--playground-muted)] md:mt-0">{row.generic}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--playground-muted-strong)] md:hidden">
                      Playground
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--playground-ink)] md:mt-0">{row.playground}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="px-4 py-14 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-[1260px]">
        <div className="grid gap-6 xl:grid-cols-[0.84fr_1.16fr]">
          <div className="space-y-5">
            <div>
              <p className="playground-section-eyebrow">Risk reversal</p>
              <h2 className="mt-3 text-balance text-4xl font-black tracking-[-0.05em] text-[var(--playground-ink)] sm:text-5xl">
                Fast enough to feel fun. Guarded enough to trust.
              </h2>
            </div>

            {SAFETY_NOTES.map((note) => (
              <article key={note} className="playground-paper-panel playground-paper-panel-mini">
                <div className="flex items-start gap-3">
                  <span className="playground-check-pill">
                    <CheckIcon className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm leading-relaxed text-[var(--playground-ink)]">{note}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, index) => {
              const panelId = `playground-faq-${index}`;
              const isOpen = openIndex === index;

              return (
                <article key={item.question} className="playground-paper-panel playground-faq-card">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? -1 : index)}
                    className="flex w-full items-center justify-between gap-4 text-left"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                  >
                    <span className="text-lg font-black tracking-tight text-[var(--playground-ink)]">{item.question}</span>
                    <span className="playground-faq-toggle" aria-hidden="true">
                      {isOpen ? "-" : "+"}
                    </span>
                  </button>
                  {isOpen ? (
                    <p id={panelId} className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--playground-muted)]">
                      {item.answer}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta({
  onStartTrial,
  isBusy,
}: {
  onStartTrial: () => void;
  isBusy: boolean;
}) {
  return (
    <section id="playground-final-cta" className="px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <div className="mx-auto max-w-[1260px]">
        <div className="playground-paper-panel playground-final-cta">
          <div className="flex flex-wrap items-center gap-3">
            <span className="playground-sticker playground-sticker-coral">Ready when you are</span>
            <span className="playground-sticker playground-sticker-paper">Builder is the most popular</span>
          </div>

          <h2 className="mt-6 max-w-4xl text-balance text-4xl font-black tracking-[-0.06em] text-[var(--playground-ink)] sm:text-6xl">
            Start the trial, point it at your repo, and let it earn a tab in your IDE.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--playground-muted)]">
            Playground is built to make real coding work feel sharper, calmer, and more reviewable from the first plan to the
            final patch.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                firePlaygroundAnalyticsEvent("playground_final_cta_click", { location: "final_section" });
                onStartTrial();
              }}
              disabled={isBusy}
              className="playground-editorial-cta-primary"
            >
              {isBusy ? "Starting checkout..." : "Start 2-day free trial"}
              <ArrowRightIcon className="h-4 w-4" />
            </button>

            <Link href="/chat" className="playground-editorial-cta-secondary">
              Explore Chat first
            </Link>
          </div>

          <p className="mt-4 text-sm font-medium text-[var(--playground-muted)]">
            Card required. Cancel before day 3 to avoid charges.
          </p>
        </div>
      </div>
    </section>
  );
}

export function PlaygroundClient() {
  const {
    isYearly,
    setIsYearly,
    isCheckoutStarting,
    checkoutError,
    clearCheckoutError,
    startCheckout,
  } = useResolvedPlaygroundMarketing();

  return (
    <div
      className="playground-editorial relative left-1/2 right-1/2 w-screen -ml-[50vw] -mr-[50vw] overflow-x-hidden"
      style={{ colorScheme: "light" }}
    >
      <div className="playground-editorial-noise" aria-hidden="true" />
      <div className="playground-editorial-orb playground-editorial-orb-cobalt" aria-hidden="true" />
      <div className="playground-editorial-orb playground-editorial-orb-coral" aria-hidden="true" />

      <HeroSection onStartTrial={() => startCheckout("builder")} isBusy={isCheckoutStarting} />
      {checkoutError ? <CheckoutErrorBanner message={checkoutError} onDismiss={clearCheckoutError} /> : null}
      <ProofStrip />
      <PricingSection
        isYearly={isYearly}
        setIsYearly={setIsYearly}
        onStartTrial={startCheckout}
        isBusy={isCheckoutStarting}
      />
      <WorkflowSection />
      <ComparisonSection />
      <FaqSection />
      <FinalCta onStartTrial={() => startCheckout("builder")} isBusy={isCheckoutStarting} />

      <div className="fixed bottom-4 left-0 right-0 z-40 px-4 pb-[env(safe-area-inset-bottom)] sm:hidden">
        <button
          type="button"
          onClick={() => {
            firePlaygroundAnalyticsEvent("playground_hero_cta_click", { location: "sticky_mobile", action: "start_trial" });
            void startCheckout("builder");
          }}
          disabled={isCheckoutStarting}
          className="playground-editorial-cta-primary w-full justify-center"
        >
          {isCheckoutStarting ? "Starting checkout..." : "Start 2-day free trial"}
        </button>
      </div>
    </div>
  );
}
