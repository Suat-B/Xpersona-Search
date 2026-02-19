"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

const STEPS = [
  {
    icon: "🎲",
    title: "Play",
    subtitle: "Roll dice, test strategies",
    description: "Start with provably fair dice games. Build and test your strategies in real-time with live balance.",
    color: "#0ea5e9",
    bg: "from-[#0ea5e9] to-[#0077b6]",
    features: ["Provably fair rolls", "Real-time PnL tracking", "Strategy builder"],
  },
  {
    icon: "🤖",
    title: "Connect AI",
    subtitle: "Let agents run 24/7",
    description: "Connect AI agents to run your strategies automatically. Human or bot — same game, same opportunities.",
    color: "#5e5ce6",
    bg: "from-[#5e5ce6] to-[#bf5af2]",
    features: ["API-first design", "Agent-ready endpoints", "Python strategies"],
  },
  {
    icon: "💰",
    title: "Earn",
    subtitle: "List & monetize",
    description: "List strategies on the marketplace. Set your price, we take 20%. Get paid in 2 days via Stripe.",
    color: "#30d158",
    bg: "from-[#30d158] to-[#248a3d]",
    features: ["Free to list", "You set the price", "2-day payouts"],
  },
];

function StepCard({ step, index, isVisible }: { step: typeof STEPS[0]; index: number; isVisible: boolean }) {
  return (
    <div
      className={`relative transition-all duration-700 ${
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-8"
      }`}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <div className="agent-card p-6 border-[var(--border)] h-full group hover:border-[${step.color}]/30 transition-all duration-300">
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${step.bg} shadow-lg mb-5 group-hover:scale-110 transition-transform duration-300`}>
          <span className="text-3xl">{step.icon}</span>
        </div>
        
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Step {index + 1}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">·</span>
          <span className="text-xs text-[var(--text-secondary)]">{step.subtitle}</span>
        </div>
        
        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-3" style={{ color: step.color }}>
          {step.title}
        </h3>
        
        <p className="text-sm text-[var(--text-secondary)] mb-5 leading-relaxed">
          {step.description}
        </p>
        
        <ul className="space-y-2">
          {step.features.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <svg className="w-3.5 h-3.5" style={{ color: step.color }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
      </div>
      
      {index < STEPS.length - 1 && (
        <div className="hidden lg:block absolute top-1/2 -right-4 w-8 h-0.5 bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
      )}
    </div>
  );
}

function ConnectionLine({ isVisible }: { isVisible: boolean }) {
  return (
    <div className="hidden lg:flex items-center justify-center gap-2 mb-12">
      {STEPS.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full transition-all duration-500 ${
              isVisible ? "scale-100" : "scale-0"
            }`}
            style={{ 
              backgroundColor: step.color,
              boxShadow: `0 0 12px ${step.color}50`,
              transitionDelay: `${i * 200}ms`,
            }}
          />
          {i < STEPS.length - 1 && (
            <div
              className={`w-20 h-0.5 bg-gradient-to-r transition-all duration-700 ${
                isVisible ? "opacity-100" : "opacity-0"
              }`}
              style={{
                backgroundImage: `linear-gradient(to right, ${step.color}, ${STEPS[i + 1].color})`,
                transitionDelay: `${i * 200 + 100}ms`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function HomeFlow() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-16 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#0ea5e9]/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[#30d158]/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#5e5ce6] animate-pulse" />
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              How It Works
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
            From play to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0ea5e9] via-[#5e5ce6] to-[#30d158]">
              profit
            </span>
          </h2>
          <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-xl mx-auto">
            Three simple steps to start earning with AI-driven strategies
          </p>
        </div>

        <ConnectionLine isVisible={isVisible} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <StepCard key={i} step={step} index={i} isVisible={isVisible} />
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#30d158] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-[#0ea5e9]/25 hover:shadow-[#0ea5e9]/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            Get Started Free
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
