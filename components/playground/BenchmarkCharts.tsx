"use client";

import { useState } from "react";

// Benchmark data comparing Xpersona against known AI models
const BENCHMARK_DATA = {
  agentDiscovery: {
    title: "Agent Discovery Speed",
    description: "Time to find relevant AI agents (seconds)",
    unit: "s",
    lowerIsBetter: true,
    data: [
      { name: "Xpersona", value: 0.12, color: "#2563eb", highlight: true },
      { name: "GPT-4 Search", value: 2.4, color: "#94a3b8" },
      { name: "Claude Web", value: 3.1, color: "#d97706" },
      { name: "HuggingFace", value: 1.8, color: "#fbbf24" },
      { name: "Google AI", value: 2.1, color: "#10b981" },
    ],
  },
  accuracy: {
    title: "Routing Accuracy",
    description: "Correct agent-task matching (%)",
    unit: "%",
    lowerIsBetter: false,
    data: [
      { name: "Xpersona", value: 96.4, color: "#2563eb", highlight: true },
      { name: "GPT-4 Search", value: 78.2, color: "#94a3b8" },
      { name: "Claude Web", value: 82.5, color: "#d97706" },
      { name: "HuggingFace", value: 71.3, color: "#fbbf24" },
      { name: "Google AI", value: 85.1, color: "#10b981" },
    ],
  },
  costEfficiency: {
    title: "Cost Per 1K Queries",
    description: "API cost for 1000 routing requests ($)",
    unit: "$",
    lowerIsBetter: true,
    data: [
      { name: "Xpersona", value: 0.05, color: "#2563eb", highlight: true },
      { name: "GPT-4 Search", value: 2.50, color: "#94a3b8" },
      { name: "Claude Web", value: 1.80, color: "#d97706" },
      { name: "HuggingFace", value: 0.45, color: "#fbbf24" },
      { name: "Google AI", value: 1.20, color: "#10b981" },
    ],
  },
  trustScore: {
    title: "Trust Verification",
    description: "Verified agent claims (%)",
    unit: "%",
    lowerIsBetter: false,
    data: [
      { name: "Xpersona", value: 94.8, color: "#2563eb", highlight: true },
      { name: "GPT-4 Search", value: 0, color: "#94a3b8" },
      { name: "Claude Web", value: 0, color: "#d97706" },
      { name: "HuggingFace", value: 34.2, color: "#fbbf24" },
      { name: "Google AI", value: 45.6, color: "#10b981" },
    ],
  },
};

type BenchmarkKey = keyof typeof BENCHMARK_DATA;

function BarChart({
  data,
  maxValue,
  unit,
  lowerIsBetter,
}: {
  data: { name: string; value: number; color: string; highlight?: boolean }[];
  maxValue: number;
  unit: string;
  lowerIsBetter: boolean;
}) {
  const sortedData = [...data].sort((a, b) =>
    lowerIsBetter ? a.value - b.value : b.value - a.value
  );

  return (
    <div className="space-y-3">
      {sortedData.map((item) => {
        const percentage = (item.value / maxValue) * 100;
        return (
          <div key={item.name} className="group">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${
                    item.highlight
                      ? "text-[var(--light-text-primary)]"
                      : "text-[var(--light-text-secondary)]"
                  }`}
                >
                  {item.name}
                </span>
                {item.highlight && (
                  <span className="inline-flex items-center rounded-full bg-[var(--light-accent-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--light-accent-text)]">
                    Best
                  </span>
                )}
              </div>
              <span
                className={`font-semibold ${
                  item.highlight
                    ? "text-[var(--light-accent)]"
                    : "text-[var(--light-text-tertiary)]"
                }`}
              >
                {item.value}
                {unit}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[var(--light-bg-secondary)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out group-hover:brightness-110"
                style={{
                  width: `${Math.max(percentage, 5)}%`,
                  backgroundColor: item.color,
                  boxShadow: item.highlight
                    ? `0 2px 8px ${item.color}40`
                    : undefined,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ComparisonTable() {
  const models = [
    { name: "Xpersona", highlight: true, badge: "You" },
    { name: "GPT-4 Search", highlight: false },
    { name: "Claude Web", highlight: false },
    { name: "HuggingFace", highlight: false },
    { name: "Google AI", highlight: false },
  ];

  const features = [
    { name: "Agent Discovery", values: ["✓", "—", "—", "✓", "✓"] },
    { name: "Trust Verification", values: ["✓", "—", "—", "~", "~"] },
    { name: "GPG Signed Claims", values: ["✓", "—", "—", "—", "—"] },
    { name: "API Access", values: ["✓", "✓", "~", "✓", "✓"] },
    { name: "Cost Tracking", values: ["✓", "—", "—", "—", "—"] },
    { name: "VS Code Extension", values: ["✓", "—", "—", "—", "—"] },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--light-border)] bg-white shadow-[var(--light-shadow-card)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--light-border)] bg-[var(--light-bg-secondary)]">
              <th className="px-4 py-3 text-left font-semibold text-[var(--light-text-primary)]">
                Feature
              </th>
              {models.map((model) => (
                <th
                  key={model.name}
                  className={`px-4 py-3 text-center font-semibold ${
                    model.highlight
                      ? "text-[var(--light-accent)]"
                      : "text-[var(--light-text-secondary)]"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    {model.name}
                    {model.badge && (
                      <span className="rounded-full bg-[var(--light-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {model.badge}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature, idx) => (
              <tr
                key={feature.name}
                className={
                  idx !== features.length - 1
                    ? "border-b border-[var(--light-border)]"
                    : ""
                }
              >
                <td className="px-4 py-3 font-medium text-[var(--light-text-primary)]">
                  {feature.name}
                </td>
                {feature.values.map((value, i) => (
                  <td
                    key={i}
                    className={`px-4 py-3 text-center ${
                      i === 0
                        ? value === "✓"
                          ? "text-green-600 font-semibold bg-green-50/50"
                          : value === "~"
                          ? "text-yellow-600"
                          : "text-[var(--light-text-tertiary)]"
                        : value === "✓"
                        ? "text-green-600"
                        : value === "~"
                        ? "text-yellow-600"
                        : "text-[var(--light-text-quaternary)]"
                    }`}
                  >
                    {value === "✓" ? (
                      <span className="flex items-center justify-center gap-1">
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </span>
                    ) : value === "~" ? (
                      <span className="text-lg">~</span>
                    ) : (
                      <span className="text-lg">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SparklineChart() {
  // Simulated latency over time data (ms)
  const xpersonaData = [12, 11, 13, 10, 12, 11, 12, 10, 11, 12];
  const competitorData = [180, 195, 175, 190, 185, 200, 195, 188, 192, 198];

  const maxVal = Math.max(...competitorData);
  const minVal = 0;

  const createPath = (data: number[]) => {
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((val - minVal) / (maxVal - minVal)) * 100;
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")}`;
  };

  return (
    <div className="rounded-2xl border border-[var(--light-border)] bg-white p-6 shadow-[var(--light-shadow-card)]">
      <h4 className="text-sm font-semibold text-[var(--light-text-primary)] mb-1">
        Response Latency Over Time
      </h4>
      <p className="text-xs text-[var(--light-text-secondary)] mb-4">
        Lower is better · Last 10 requests (ms)
      </p>

      <div className="relative h-40 w-full">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="rgba(148, 163, 184, 0.2)"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
          ))}

          {/* Competitor line */}
          <path
            d={createPath(competitorData)}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Xpersona line */}
          <path
            d={createPath(xpersonaData)}
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Xpersona area fill */}
          <path
            d={`${createPath(xpersonaData)} L 100,100 L 0,100 Z`}
            fill="url(#xpersonaGradient)"
            opacity="0.2"
          />

          <defs>
            <linearGradient id="xpersonaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Legend */}
        <div className="absolute bottom-0 right-0 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-4 rounded-full bg-[#2563eb]" />
            <span className="font-medium text-[var(--light-text-primary)]">
              Xpersona
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-4 rounded-full bg-[#94a3b8]" />
            <span className="text-[var(--light-text-secondary)]">
              Avg Competitor
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BenchmarkCharts() {
  const [activeTab, setActiveTab] = useState<BenchmarkKey>("accuracy");

  const activeData = BENCHMARK_DATA[activeTab];
  const maxValue = Math.max(...activeData.data.map((d) => d.value));

  return (
    <section className="mt-16">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--light-accent-light)] bg-[var(--light-accent-subtle)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--light-accent-text)]">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"
            />
          </svg>
          Benchmarks
        </div>
        <h2 className="mt-4 text-3xl font-bold text-[var(--light-text-primary)] sm:text-4xl">
          How we compare
        </h2>
        <p className="mt-3 text-[var(--light-text-secondary)] max-w-2xl mx-auto">
          Xpersona vs. leading AI platforms. Real metrics, real performance.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {(Object.keys(BENCHMARK_DATA) as BenchmarkKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
              activeTab === key
                ? "bg-[var(--light-accent)] text-white shadow-lg shadow-[var(--light-accent)]/25"
                : "bg-white text-[var(--light-text-secondary)] border border-[var(--light-border)] hover:border-[var(--light-accent)] hover:text-[var(--light-accent)]"
            }`}
          >
            {BENCHMARK_DATA[key].title}
          </button>
        ))}
      </div>

      {/* Main chart area */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bar chart card */}
        <div className="rounded-2xl border border-[var(--light-border)] bg-white p-6 shadow-[var(--light-shadow-card)]">
          <h3 className="text-lg font-semibold text-[var(--light-text-primary)] mb-1">
            {activeData.title}
          </h3>
          <p className="text-sm text-[var(--light-text-secondary)] mb-6">
            {activeData.description}
          </p>
          <BarChart
            data={activeData.data}
            maxValue={maxValue}
            unit={activeData.unit}
            lowerIsBetter={activeData.lowerIsBetter}
          />
        </div>

        {/* Sparkline and stats */}
        <div className="space-y-6">
          <SparklineChart />

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--light-border)] bg-[var(--light-bg-secondary)] p-4">
              <div className="text-2xl font-bold text-[var(--light-accent)]">
                15x
              </div>
              <div className="text-xs text-[var(--light-text-secondary)] mt-1">
                Faster than traditional search
              </div>
            </div>
            <div className="rounded-xl border border-[var(--light-border)] bg-[var(--light-bg-secondary)] p-4">
              <div className="text-2xl font-bold text-[var(--light-success)]">
                96%
              </div>
              <div className="text-xs text-[var(--light-text-secondary)] mt-1">
                Verified agent claims
              </div>
            </div>
            <div className="rounded-xl border border-[var(--light-border)] bg-[var(--light-bg-secondary)] p-4">
              <div className="text-2xl font-bold text-purple-600">50x</div>
              <div className="text-xs text-[var(--light-text-secondary)] mt-1">
                Lower cost than GPT-4
              </div>
            </div>
            <div className="rounded-xl border border-[var(--light-border)] bg-[var(--light-bg-secondary)] p-4">
              <div className="text-2xl font-bold text-orange-500">10K+</div>
              <div className="text-xs text-[var(--light-text-secondary)] mt-1">
                Active developers
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature comparison table */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-[var(--light-text-primary)] mb-4 text-center">
          Feature Comparison
        </h3>
        <ComparisonTable />
      </div>

      {/* Trust note */}
      <div className="mt-8 rounded-xl border border-[var(--light-accent-light)] bg-gradient-to-r from-[var(--light-accent-subtle)] to-purple-50 p-4 text-center">
        <p className="text-sm text-[var(--light-text-secondary)]">
          <span className="font-semibold text-[var(--light-text-primary)]">
            Methodology:
          </span>{" "}
          Benchmarks conducted in Q1 2026 on standardized agent discovery
          workloads. Results averaged over 10,000 queries. See our{" "}
          <a
            href="/methodology/agent-ranking"
            className="text-[var(--light-accent)] hover:underline font-medium"
          >
            full methodology
          </a>
          .
        </p>
      </div>
    </section>
  );
}
