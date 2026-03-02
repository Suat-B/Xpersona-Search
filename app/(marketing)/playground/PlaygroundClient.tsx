"use client";

import { useState } from "react";
import { BenchmarkCharts } from "../../components/playground/BenchmarkCharts";

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

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
    </svg>
  );
}

function GlobeAltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

const PLANS = [
  {
    name: "Starter",
    monthlyPrice: 2,
    yearlyPrice: 20,
    description: "Perfect for learning and experimentation.",
    modelBadge: "Qwen 2.5 for Reasoning",
    features: [
      { text: "2-day free trial", icon: SparklesIcon },
      { text: "Full Playground access", icon: CodeIcon },
      { text: "8K context window", icon: CpuIcon },
      { text: "30 requests/day", icon: BoltIcon },
    ],
    highlight: false,
    cta: "Start Free Trial",
  },
  {
    name: "Builder",
    monthlyPrice: 5,
    yearlyPrice: 50,
    description: "For developers building production apps.",
    modelBadge: "Qwen 2.5 for Reasoning",
    features: [
      { text: "2-day free trial", icon: SparklesIcon },
      { text: "Priority capacity", icon: BoltIcon },
      { text: "16K context window", icon: CpuIcon },
      { text: "100 requests/day", icon: CodeIcon },
      { text: "Usage insights", icon: SparklesIcon },
    ],
    highlight: true,
    cta: "Start Free Trial",
  },
  {
    name: "Studio",
    monthlyPrice: 10,
    yearlyPrice: 100,
    description: "For power users and teams.",
    modelBadge: "Qwen 2.5 for Reasoning",
    features: [
      { text: "2-day free trial", icon: SparklesIcon },
      { text: "Highest capacity", icon: BoltIcon },
      { text: "32K context window", icon: CpuIcon },
      { text: "Unlimited requests", icon: CodeIcon },
      { text: "Direct support", icon: SparklesIcon },
    ],
    highlight: false,
    cta: "Start Free Trial",
  },
];

const CAPABILITIES = [
  {
    title: "Code Generation",
    description: "Generate clean, efficient code in 50+ languages",
    code: `// Generate a React component
const Button = ({ onClick, children }) => (
  <button 
    onClick={onClick}
    className="px-4 py-2 bg-purple-600 rounded-lg"
  >
    {children}
  </button>
);`,
    color: "from-purple-600 to-pink-500",
  },
  {
    title: "Bug Detection",
    description: "Find and fix bugs before they reach production",
    code: `// Find bugs in your code
// Qwen detected: Missing error handling
async function fetchData(url) {
  const response = await fetch(url);
  // Add: if (!response.ok) throw Error()
  return response.json();
}`,
    color: "from-cyan-500 to-blue-600",
  },
  {
    title: "Code Explanation",
    description: "Understand complex codebases instantly",
    code: `// Explain what this function does
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
// Returns a function that delays execution...`,
    color: "from-amber-500 to-orange-600",
  },
];

export function PlaygroundClient() {
  const [isYearly, setIsYearly] = useState(false);
  const [activeCap, setActiveCap] = useState(0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-cyan-400/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-tr from-cyan-400/20 to-purple-400/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-purple-500/5 to-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Hero Section */}
      <section className="relative pt-16 pb-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto text-center">
          {/* Model Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-600/10 to-cyan-500/10 border border-purple-200 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
            </span>
            <span className="text-sm font-semibold bg-gradient-to-r from-purple-700 to-cyan-600 bg-clip-text text-transparent">
              Powered by Qwen 2.5
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 mb-6">
            <span className="bg-gradient-to-r from-purple-600 via-cyan-500 to-purple-600 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
              Playground
            </span>
            <br />
            <span className="text-slate-900">for Reasoning</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto mb-8">
            Build faster with <span className="font-semibold text-purple-700">Qwen 2.5 for reasoning</span> — 
            the same model powering Alibaba's AI, now available at every price point.
          </p>

          {/* Stats Row */}
          <div className="flex flex-wrap justify-center gap-6 sm:gap-12 mb-10">
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-900">92.1%</div>
              <div className="text-sm text-slate-500">HumanEval Score</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-900">~50ms</div>
              <div className="text-sm text-slate-500">Avg Latency</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-900">7B</div>
              <div className="text-sm text-slate-500">Parameters</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-900">50+</div>
              <div className="text-sm text-slate-500">Languages</div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-wrap justify-center gap-4">
            <button className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-7 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(124,58,237,0.3)] transition-all hover:translate-y-[-2px] hover:shadow-[0_20px_50px_rgba(124,58,237,0.4)]">
              Start free trial
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button className="rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-purple-300 hover:bg-purple-50">
              View Documentation
            </button>
          </div>

          {/* Trust Badges */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-green-600" />
              <span>Enterprise Security</span>
            </div>
            <div className="flex items-center gap-2">
              <GlobeAltIcon className="h-5 w-5 text-cyan-600" />
              <span>99.9% Uptime SLA</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckIcon className="h-5 w-5 text-purple-600" />
              <span>10K+ Developers</span>
            </div>
          </div>
        </div>
      </section>

      {/* Benchmark Section */}
      <BenchmarkCharts />

      {/* Capabilities Section */}
      <section className="py-16 px-4 sm:px-6 bg-slate-50/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              What you can build
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              From code generation to bug detection, Qwen 2.5 powers the most demanding development workflows.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {CAPABILITIES.map((cap, index) => (
              <div 
                key={cap.title}
                className={`group relative rounded-2xl bg-white border transition-all duration-300 cursor-pointer ${
                  activeCap === index 
                    ? "border-purple-300 shadow-xl shadow-purple-500/10" 
                    : "border-slate-200 hover:border-purple-200 hover:shadow-lg"
                }`}
                onClick={() => setActiveCap(index)}
              >
                <div className="p-6">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cap.color} flex items-center justify-center mb-4`}>
                    <CodeIcon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{cap.title}</h3>
                  <p className="text-sm text-slate-600">{cap.description}</p>
                </div>
                
                {/* Code Preview */}
                <div className="p-4 pt-0">
                  <div className="rounded-xl bg-slate-900 p-4 text-xs font-mono text-slate-300 overflow-hidden">
                    <pre className="whitespace-pre-wrap break-all">{cap.code}</pre>
                  </div>
                </div>
                
                {activeCap === index && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-lg text-slate-600">
              All plans include <span className="font-semibold text-purple-700">Qwen 2.5 for reasoning</span>. 
              Choose the tier that fits your needs.
            </p>
          </div>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-10">
            <div className="relative flex items-center gap-4 rounded-full bg-white p-1.5 shadow-lg shadow-slate-200/50 border border-slate-200">
              <button
                onClick={() => setIsYearly(false)}
                className={`relative z-10 rounded-full px-5 py-2 text-sm font-semibold transition ${
                  !isYearly ? "text-white" : "text-slate-600"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsYearly(true)}
                className={`relative z-10 rounded-full px-5 py-2 text-sm font-semibold transition ${
                  isYearly ? "text-white" : "text-slate-600"
                }`}
              >
                Yearly
                <span className="ml-1.5 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                  Save 17%
                </span>
              </button>
              <div
                className={`absolute top-1 h-[calc(100%-12px)] rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 shadow-lg transition-all duration-300 ${
                  isYearly ? "left-1/2 w-[130px]" : "left-1.5 w-[90px]"
                }`}
              />
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {PLANS.map((plan, index) => (
              <article
                key={plan.name}
                className={`group relative rounded-2xl bg-white p-6 sm:p-8 transition-all duration-300 ${
                  plan.highlight
                    ? "border-2 border-purple-300 shadow-xl shadow-purple-500/15 scale-105 z-10"
                    : "border border-slate-200 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:border-purple-200"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white shadow-lg">
                    Most Popular
                  </div>
                )}
                
                {/* Model Badge */}
                <div className="flex items-center justify-center mb-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-purple-100 to-cyan-100 text-xs font-semibold text-purple-700">
                    <SparklesIcon className="h-3 w-3" />
                    {plan.modelBadge}
                  </span>
                </div>

                <div className="text-center mb-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">
                    {plan.name}
                  </div>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                      ${isYearly ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice}
                    </span>
                    <span className="text-sm text-slate-500">/mo</span>
                  </div>
                  {isYearly && (
                    <div className="text-xs text-green-600 font-medium mt-1">
                      ${plan.yearlyPrice}/yr billed annually
                    </div>
                  )}
                  <p className="mt-3 text-sm text-slate-600">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature.text} className="flex items-start gap-3">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                        plan.highlight 
                          ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white" 
                          : "bg-purple-100 text-purple-600"
                      }`}>
                        <feature.icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-sm text-slate-600">{feature.text}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                    plan.highlight
                      ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow-lg shadow-purple-500/25 hover:shadow-xl hover:-translate-y-0.5"
                      : "border-2 border-slate-200 text-slate-700 hover:border-purple-300 hover:bg-purple-50"
                  }`}
                >
                  {plan.cta}
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>

          <p className="text-center text-sm text-slate-500 mt-8">
            All plans include a 2-day free trial. No credit card required to start.
          </p>
        </div>
      </section>

      {/* VS Code Extension Section */}
      <section className="py-16 px-4 sm:px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Left Content */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-600/10 to-cyan-500/10 border border-purple-200 mb-4">
                <span className="text-sm font-semibold text-purple-700">VS Code Extension</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
                Build faster inside your editor
              </h2>
              <p className="text-lg text-slate-600 mb-6">
                Launch Playground workflows from VS Code, keep prompts close to your code, and ship experiments without context switching.
              </p>
              
              <div className="flex flex-wrap gap-3 mb-6">
                <span className="px-4 py-2 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-sm font-medium">
                  One-click launch
                </span>
                <span className="px-4 py-2 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-sm font-medium">
                  Prompt history
                </span>
                <span className="px-4 py-2 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-sm font-medium">
                  Model shortcuts
                </span>
              </div>

              <button className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:shadow-xl hover:-translate-y-0.5">
                Download Extension
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            {/* Right - Code Preview */}
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 rounded-3xl blur-2xl" />
              <div className="relative rounded-2xl bg-slate-900 p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="ml-2 text-xs text-slate-500">playground.ts</span>
                </div>
                <div className="space-y-3 text-sm font-mono">
                  <div className="text-purple-400">// Generate a React component</div>
                  <div className="text-slate-300">
                    <span className="text-cyan-400">const</span> Component = <span className="text-cyan-400">await</span> playground.<span className="text-yellow-300">generate</span>({'{'}
                  </div>
                  <div className="pl-4 text-slate-400">
                    model: <span className="text-green-400">'qwen-2.5-coder'</span>,
                  </div>
                  <div className="pl-4 text-slate-400">
                    prompt: <span className="text-green-400">'Create a button component'</span>,
                  </div>
                  <div className="pl-4 text-slate-400">
                    language: <span className="text-green-400">'typescript'</span>
                  </div>
                  <div className="text-slate-300">{'}'});</div>
                  <div className="text-slate-500 pt-2">// Output: React button component code</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Ready to build smarter?
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Join thousands of developers using Playground with Qwen 2.5 for reasoning. 
            Start your free trial today.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-purple-500/25 transition-all hover:translate-y-[-2px] hover:shadow-2xl hover:shadow-purple-500/30">
              Start Free Trial
              <ArrowRightIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            <StarIcon className="inline h-4 w-4 text-yellow-400" />
            <span className="ml-1">4.9/5 from 10,000+ reviews</span>
          </p>
        </div>
      </section>
    </div>
  );
}
