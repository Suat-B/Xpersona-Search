"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    id: "explorer",
    name: "Explorer",
    price: 9,
    description: "Dip your toes into AI-driven trading",
    features: [
      "1 strategy subscription",
      "Delayed signals (15 min)",
      "Email notifications",
      "Basic performance metrics",
      "Community Discord access",
    ],
    cta: "Start Exploring",
    popular: false,
    color: "#0ea5e9",
  },
  {
    id: "trader",
    name: "Trader",
    price: 49,
    description: "For serious traders who want real-time data",
    features: [
      "5 strategy subscriptions",
      "Real-time signals",
      "Discord + Email + Push",
      "Advanced analytics dashboard",
      "Priority support",
      "API access (100 req/min)",
    ],
    cta: "Start Trading",
    popular: true,
    color: "#30d158",
  },
  {
    id: "pro",
    name: "Pro",
    price: 149,
    description: "Unlimited access for professional traders",
    features: [
      "Unlimited strategies",
      "Real-time signals",
      "All notification channels",
      "Full analytics suite",
      "Dedicated account manager",
      "Unlimited API access",
      "Custom webhook integrations",
      "White-label reporting",
    ],
    cta: "Go Pro",
    popular: false,
    color: "#bf5af2",
  },
];

function TierCard({ tier, isVisible, index }: { tier: typeof TIERS[0]; isVisible: boolean; index: number }) {
  return (
    <div
      className={cn(
        "relative agent-card p-6 border transition-all duration-700 h-full flex flex-col",
        tier.popular 
          ? "border-[#30d158]/40 shadow-lg shadow-[#30d158]/10" 
          : "border-[var(--border)]",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      )}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      {tier.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#30d158] text-xs font-semibold text-black">
          Most Popular
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-xl font-bold text-[var(--text-primary)]">{tier.name}</h3>
        <p className="text-xs text-[var(--text-secondary)] mt-1">{tier.description}</p>
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold" style={{ color: tier.color }}>${tier.price}</span>
          <span className="text-sm text-[var(--text-tertiary)]">/month</span>
        </div>
      </div>

      <ul className="space-y-3 mb-6 flex-1">
        {tier.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: tier.color }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      <Link
        href="/auth/signup"
        className={cn(
          "block text-center py-3 rounded-lg font-semibold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
          tier.popular
            ? "bg-[#30d158] text-black hover:bg-[#30d158]/90"
            : "bg-white/10 text-[var(--text-primary)] hover:bg-white/15"
        )}
      >
        {tier.cta}
      </Link>
    </div>
  );
}

export function HomePricing() {
  const [isVisible, setIsVisible] = useState(false);
  const [annual, setAnnual] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-16 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#bf5af2]/5 to-transparent pointer-events-none" />

      <div className="relative z-10">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#bf5af2] animate-pulse" />
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              Pricing
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
            Choose your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0ea5e9] via-[#30d158] to-[#bf5af2]">
              trading edge
            </span>
          </h2>
          <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-xl mx-auto">
            Start free, upgrade when you're ready. All plans include marketplace access.
          </p>

          <div className="flex items-center justify-center gap-4 mt-6">
            <span className={cn("text-sm", !annual ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>
              Monthly
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={cn(
                "relative w-14 h-7 rounded-full transition-colors",
                annual ? "bg-[#30d158]" : "bg-white/20"
              )}
            >
              <div
                className={cn(
                  "absolute top-1 w-5 h-5 rounded-full bg-white transition-all",
                  annual ? "left-8" : "left-1"
                )}
              />
            </button>
            <span className={cn("text-sm", annual ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>
              Annual
              <span className="ml-1 text-[#30d158] text-xs">Save 20%</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {TIERS.map((tier, i) => (
            <TierCard key={tier.id} tier={tier} isVisible={isVisible} index={i} />
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-[var(--text-tertiary)]">
            All plans include a 7-day free trial. Cancel anytime. No questions asked.
          </p>
        </div>

        <div className="mt-8 agent-card p-6 border-[var(--border)] max-w-2xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">Pay-per-strategy</div>
              <div className="text-xs text-[var(--text-secondary)]">
                Try any strategy for 7 days — just $5
              </div>
            </div>
            <Link
              href="/trading"
              className="px-5 py-2.5 rounded-lg text-sm font-medium bg-white/10 text-[var(--text-primary)] hover:bg-white/15 transition-colors"
            >
              Browse strategies
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
