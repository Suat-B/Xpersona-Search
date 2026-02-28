"use client";


const FAQS = [
  {
    question: "What\u2019s the difference between simple and advanced strategies?",
    answer:
      "Simple strategies are quick setup presets. Advanced strategies use the rule builder with execution modes and multi-condition logic.",
  },
  {
    question: "How do I run a strategy?",
    answer:
      "Use the Run button on a strategy card to launch an execution run with that configuration.",
  },
  {
    question: "Where are strategies saved?",
    answer:
      "Saved strategies live in My Strategies on this page and are tied to your account.",
  },
] as const;

export default function StrategiesPage() {
  return (
    <div className="space-y-8 animate-fade-in-up">
      <header>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-neural)] animate-pulse" />
          <span className="text-xs font-medium text-[var(--dash-text-secondary)] uppercase tracking-wider">
            Strategy Lab
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-gradient-primary">
          Strategies
        </h1>
        <p className="mt-2 text-sm text-[var(--dash-text-secondary)] max-w-2xl">
          Build, save, and run your strategies. Combine quick presets with the advanced rule
          builder to validate ideas faster.
        </p>
      </header>

      <section className="agent-card p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--accent-neural)]">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Coming soon</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          We’re polishing the new strategy experience. Check back shortly for the upgraded builder and
          management tools.
        </p>
      </section>

      <section className="agent-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-neural)]/10 text-[var(--accent-neural)] border border-[var(--accent-neural)]/20">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M12 18a6 6 0 100-12 6 6 0 000 12z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Help & FAQ</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Quick guidance for building and running strategies.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FAQS.map((item) => (
            <div key={item.question} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                {item.question}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
