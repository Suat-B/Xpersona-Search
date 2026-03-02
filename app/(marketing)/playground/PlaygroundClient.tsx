"use client";

import { useState } from "react";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function CubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}

const PLANS = [
  {
    name: "Starter",
    monthlyPrice: 2,
    yearlyPrice: 20,
    description: "Quick access for lightweight experiments.",
    features: [
      { text: "2-day free trial", icon: SparklesIcon },
      { text: "Core Playground access", icon: BoltIcon },
      { text: "Community updates", icon: CubeIcon },
    ],
    highlight: false,
    cta: "Start Starter",
  },
  {
    name: "Builder",
    monthlyPrice: 5,
    yearlyPrice: 50,
    description: "Balanced plan for steady prototyping.",
    features: [
      { text: "2-day free trial", icon: SparklesIcon },
      { text: "Priority Playground capacity", icon: BoltIcon },
      { text: "Usage insights dashboard", icon: CubeIcon },
    ],
    highlight: true,
    cta: "Start Builder",
  },
  {
    name: "Studio",
    monthlyPrice: 10,
    yearlyPrice: 100,
    description: "Full-time workflows and extended usage.",
    features: [
      { text: "2-day free trial", icon: SparklesIcon },
      { text: "Highest capacity tier", icon: BoltIcon },
      { text: "Direct support channel", icon: CubeIcon },
    ],
    highlight: false,
    cta: "Start Studio",
  },
];

export function PlaygroundClient() {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <section className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 right-6 h-64 w-64 rounded-full bg-[var(--light-accent)]/15 blur-[80px]" />
        <div className="absolute -bottom-28 left-8 h-72 w-72 rounded-full bg-[var(--accent-heart)]/10 blur-[90px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-gradient-to-r from-[var(--light-accent)]/5 to-purple-500/5 blur-[100px]" />
      </div>

      <div className="rounded-[32px] border border-white/60 bg-white/80 p-6 shadow-[0_24px_70px_rgba(18,26,48,0.08)] backdrop-blur sm:p-10 lg:p-12">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--light-accent)]/30 bg-[var(--light-accent)]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--light-accent)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--light-accent)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--light-accent)]" />
              </span>
              Playground
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-[var(--light-text-primary)] sm:text-5xl lg:text-6xl">
              Build faster with
              <span className="block bg-gradient-to-r from-[var(--light-accent)] to-purple-600 bg-clip-text text-transparent">
                the right plan
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-[var(--light-text-secondary)] sm:text-lg max-w-lg">
              Choose the tier that matches your build pace. Every plan includes a 2-day free trial.
            </p>
            
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 rounded-full bg-white pr-5 shadow-lg shadow-[var(--light-accent)]/10 border border-[var(--light-border)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--light-accent)] text-white">
                  <CheckIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[var(--light-text-primary)]">10,000+ developers</div>
                  <div className="text-xs text-[var(--light-text-tertiary)]">trust Xpersona</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <div className="flex -space-x-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-6 w-6 rounded-full border-2 border-white bg-gradient-to-br from-gray-100 to-gray-300" />
                  ))}
                </div>
                <div className="flex items-center gap-1 text-[var(--light-text-secondary)]">
                  <StarIcon className="h-4 w-4 text-yellow-400" />
                  <span className="font-semibold">4.9/5</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button className="group relative inline-flex items-center gap-2 rounded-xl bg-[var(--light-accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,92,255,0.25)] transition-all hover:translate-y-[-2px] hover:shadow-[0_20px_50px_rgba(0,92,255,0.35)]">
                Start free trial
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button className="rounded-xl border border-[var(--light-border)] bg-white px-5 py-3 text-sm font-semibold text-[var(--light-text-primary)] transition hover:border-[var(--light-accent)] hover:bg-[var(--light-accent)]/5">
                Compare plans
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--light-accent-light)] bg-gradient-to-br from-[var(--light-accent-subtle)] to-purple-50/50 px-6 py-5 shadow-[var(--light-shadow-card)]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--light-accent)] text-white">
                <SparklesIcon className="h-4 w-4" />
              </div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--light-accent-text)]">
                Free Trial
              </div>
            </div>
            <p className="mt-3 leading-relaxed text-[var(--light-text-secondary)]">
              Start with a <span className="font-semibold text-[var(--light-text-primary)]">2-day free trial</span> on any plan. Cancel anytime before the trial ends to avoid charges.
            </p>
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <div className="relative flex items-center gap-4 rounded-full bg-white p-1.5 shadow-lg shadow-[var(--light-accent)]/10 border border-[var(--light-border)]">
            <button
              onClick={() => setIsYearly(false)}
              className={`relative z-10 rounded-full px-5 py-2 text-sm font-semibold transition ${
                !isYearly ? "text-white" : "text-[var(--light-text-secondary)]"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`relative z-10 rounded-full px-5 py-2 text-sm font-semibold transition ${
                isYearly ? "text-white" : "text-[var(--light-text-secondary)]"
              }`}
            >
              Yearly
              <span className="ml-1.5 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                Save 17%
              </span>
            </button>
            <div
              className={`absolute top-1 h-[calc(100%-12px)] rounded-full bg-[var(--light-accent)] shadow-lg transition-all duration-300 ${
                isYearly ? "left-1/2 w-[120px]" : "left-1.5 w-[90px]"
              }`}
            />
          </div>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PLANS.map((plan, index) => (
            <article
              key={plan.name}
              className={`group relative rounded-2xl border bg-white p-6 transition-all duration-300 ${
                plan.highlight
                  ? "border-[var(--light-accent)] shadow-[0_18px_50px_rgba(0,92,255,0.2)]"
                  : "border-[var(--light-border)] shadow-[var(--light-shadow-card)] hover:shadow-xl hover:border-[var(--light-accent)]/50"
              } hover:-translate-y-1`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[var(--light-accent)] to-purple-600 px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white shadow-[0_10px_24px_rgba(0,92,255,0.35)]">
                  Most popular
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--light-text-tertiary)]">
                  {plan.name}
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                  <SparklesIcon className="h-3 w-3" />
                  2-day trial
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-5xl font-bold text-[var(--light-text-primary)] tracking-tight">
                  ${isYearly ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice}
                </span>
                <span className="text-sm text-[var(--light-text-tertiary)]">/mo</span>
                {isYearly && (
                  <span className="ml-2 text-xs text-green-600 font-medium">
                    ${plan.yearlyPrice}/yr billed
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--light-text-secondary)]">
                {plan.description}
              </p>
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature.text} className="flex items-start gap-3">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                      plan.highlight 
                        ? "bg-[var(--light-accent)] text-white" 
                        : "bg-[var(--light-accent)]/10 text-[var(--light-accent)]"
                    }`}>
                      <feature.icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm text-[var(--light-text-secondary)]">{feature.text}</span>
                  </li>
                ))}
              </ul>
              <button
                className={`mt-8 w-full group/btn flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                  plan.highlight
                    ? "bg-[var(--light-accent)] text-white shadow-[0_12px_28px_rgba(0,92,255,0.25)] hover:translate-y-[-1px] hover:shadow-[0_16px_36px_rgba(0,92,255,0.35)]"
                    : "border-2 border-[var(--light-border)] text-[var(--light-text-primary)] hover:border-[var(--light-accent)] hover:bg-[var(--light-accent)]/5"
                }`}
              >
                {plan.cta}
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </button>
            </article>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-[var(--light-text-secondary)]">
            All plans include a 2-day free trial.{" "}
            <a href="#" className="font-semibold text-[var(--light-accent)] hover:underline">
              View full comparison
            </a>
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="group relative overflow-hidden rounded-2xl border border-[var(--light-border)] bg-white p-6 shadow-[var(--light-shadow-card)] transition-all hover:border-[var(--light-accent)]/50 hover:shadow-xl">
            <div className="absolute -right-2 -top-2 rounded-full bg-gradient-to-r from-[var(--light-accent)] to-purple-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white shadow-lg">
              New
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--light-text-tertiary)]">
              VS Code Extension
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--light-text-primary)]">
              Build faster inside your editor
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--light-text-secondary)]">
              Launch Playground workflows from VS Code, keep prompts close to your code, and ship
              experiments without context switching.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-[var(--light-text-secondary)]">
              <span className="rounded-full border border-[var(--light-border)] bg-[var(--light-bg-secondary)] px-3 py-1 transition-colors group-hover:border-[var(--light-accent)] group-hover:text-[var(--light-accent)]">
                One-click launch
              </span>
              <span className="rounded-full border border-[var(--light-border)] bg-[var(--light-bg-secondary)] px-3 py-1 transition-colors group-hover:border-[var(--light-accent)] group-hover:text-[var(--light-accent)]">
                Prompt history
              </span>
              <span className="rounded-full border border-[var(--light-border)] bg-[var(--light-bg-secondary)] px-3 py-1 transition-colors group-hover:border-[var(--light-accent)] group-hover:text-[var(--light-accent)]">
                Model shortcuts
              </span>
            </div>
            <div className="mt-6 rounded-2xl border border-[var(--light-border)] bg-[var(--light-bg-secondary)] p-4 shadow-inner">
              <div className="flex items-center justify-between text-xs text-[var(--light-text-tertiary)]">
                <span className="font-semibold">playground.ts</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--light-text-secondary)]">
                  Xpersona
                </span>
              </div>
              <div className="mt-4 grid gap-3 text-[11px] text-[var(--light-text-secondary)]">
                <div className="flex items-start gap-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2">
                  <span className="text-[var(--light-accent)]">1</span>
                  <span>Open Playground with your selection.</span>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2">
                  <span className="text-[var(--light-accent)]">2</span>
                  <span>Generate a structured prompt template.</span>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2">
                  <span className="text-[var(--light-accent)]">3</span>
                  <span>Ship the result back into your repo.</span>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-[var(--light-border)] bg-white px-3 py-2 text-[11px] text-[var(--light-text-primary)] shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="font-semibold">Xpersona Playground</span>
                  <span className="text-[10px] text-[var(--light-text-tertiary)]">Connected</span>
                </div>
              </div>
            </div>
          </div>
          <div className="group relative rounded-2xl border border-[var(--light-accent-light)] bg-gradient-to-br from-[var(--light-accent-subtle)] to-purple-50/50 p-6 text-[var(--light-text-secondary)] shadow-[var(--light-shadow-card)] transition-all hover:shadow-lg">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--light-accent)] text-white">
                <BoltIcon className="h-4 w-4" />
              </div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--light-accent-text)]">
                Install VSIX
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed">
              Download the VSIX, install locally, and launch Playground with a single command.
            </p>
            <div className="mt-4 space-y-3 rounded-xl border border-white/60 bg-white/80 p-4 text-xs text-[var(--light-text-secondary)] shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-[var(--light-text-primary)]">Install</span>
                <span className="rounded-full bg-[var(--light-bg-secondary)] px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  VSIX
                </span>
              </div>
              <div className="rounded-lg bg-[var(--light-bg-secondary)] px-3 py-2 font-mono text-[11px] text-[var(--light-text-primary)]">
                code --install-extension xpersona-playground-0.0.1.vsix
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs text-[var(--light-text-secondary)]">
              <div className="flex items-center justify-between rounded-lg border border-white/60 bg-white/70 px-3 py-2">
                <span>Command Palette</span>
                <span className="font-semibold text-[var(--light-text-primary)]">Xpersona: Open Playground</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/60 bg-white/70 px-3 py-2">
                <span>With selection</span>
                <span className="font-semibold text-[var(--light-text-primary)]">Xpersona: Open Playground With Selection</span>
              </div>
            </div>
            <a
              href="/downloads/xpersona-playground-0.0.1.vsix"
              download
              className="mt-5 w-full group/btn flex items-center justify-center gap-2 rounded-xl bg-[var(--light-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(0,92,255,0.25)] transition-all hover:translate-y-[-1px] hover:shadow-[0_16px_36px_rgba(0,92,255,0.35)]"
            >
              Download VSIX
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
