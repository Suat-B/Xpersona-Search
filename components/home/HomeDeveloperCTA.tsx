"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

function EarningsCalculator() {
  const [subscribers, setSubscribers] = useState(50);
  const [price, setPrice] = useState(49);
  
  const grossEarnings = subscribers * price;
  const platformFee = grossEarnings * 0.2;
  const netEarnings = grossEarnings - platformFee;

  return (
    <div className="agent-card p-6 border-[var(--border)]">
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Earnings Calculator</h4>
      
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs text-[var(--text-tertiary)] mb-1">
            <span>Subscribers</span>
            <span>{subscribers}</span>
          </div>
          <input
            type="range"
            min="1"
            max="500"
            value={subscribers}
            onChange={(e) => setSubscribers(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#30d158]"
          />
        </div>
        
        <div>
          <div className="flex justify-between text-xs text-[var(--text-tertiary)] mb-1">
            <span>Price per month</span>
            <span>${price}</span>
          </div>
          <input
            type="range"
            min="9"
            max="199"
            step="10"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#0ea5e9]"
          />
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-[var(--border)]">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-[var(--text-tertiary)]">Gross earnings</span>
          <span className="text-sm text-[var(--text-primary)]">${grossEarnings.toLocaleString()}/mo</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-[var(--text-tertiary)]">Platform fee (20%)</span>
          <span className="text-sm text-[#ff453a]">-${platformFee.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-[var(--border)]">
          <span className="text-sm font-medium text-[var(--text-primary)]">You earn</span>
          <span className="text-xl font-bold text-[#30d158]">${netEarnings.toLocaleString()}/mo</span>
        </div>
      </div>
    </div>
  );
}

const DEVELOPER_FEATURES = [
  {
    icon: "🎯",
    title: "Free to list",
    description: "No upfront costs. List as many strategies as you want.",
  },
  {
    icon: "💵",
    title: "Set your price",
    description: "$9.99 to $999/mo. You decide the value of your strategy.",
  },
  {
    icon: "⚡",
    title: "2-day payouts",
    description: "Stripe Connect sends earnings directly to your bank.",
  },
  {
    icon: "📊",
    title: "Real-time analytics",
    description: "Track subscribers, revenue, and performance metrics.",
  },
];

export function HomeDeveloperCTA() {
  const [isVisible, setIsVisible] = useState(false);
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
    <section ref={ref} className="py-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#30d158]/10 via-transparent to-[#0ea5e9]/10 pointer-events-none" />

      <div className="relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
              <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                For Developers
              </span>
            </div>
            
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-4">
              Build. List.{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#30d158] to-[#0ea5e9]">
                Earn.
              </span>
            </h2>
            
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-lg">
              Turn your trading strategies into passive income. List for free, set your price, 
              and get paid every 2 days. We handle payments, taxes, and compliance.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              {DEVELOPER_FEATURES.map((f, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xl">{f.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">{f.title}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{f.description}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/strategies"
                className="inline-flex items-center gap-2 rounded-lg bg-[#30d158] px-6 py-3 text-sm font-semibold text-black hover:bg-[#30d158]/90 transition-colors"
              >
                Developer Dashboard
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/dashboard/strategies"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 transition-colors"
              >
                List a Strategy
              </Link>
            </div>
          </div>

          <div className={`transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}>
            <EarningsCalculator />

            <div className="mt-4 agent-card p-4 border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#30d158] to-[#0ea5e9] flex items-center justify-center text-white text-xl">
                  💳
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--text-primary)]">Stripe Connect</div>
                  <div className="text-xs text-[var(--text-secondary)]">Connect your bank in 2 minutes</div>
                </div>
                <svg className="w-5 h-5 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="agent-card p-3 border-[var(--border)] text-center">
                <div className="text-xl font-bold text-[#30d158]">80%</div>
                <div className="text-xs text-[var(--text-tertiary)]">You keep</div>
              </div>
              <div className="agent-card p-3 border-[var(--border)] text-center">
                <div className="text-xl font-bold text-[var(--text-primary)]">2 days</div>
                <div className="text-xs text-[var(--text-tertiary)]">Payout time</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
