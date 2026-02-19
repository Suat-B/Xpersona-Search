"use client";

import { useEffect, useState, useRef } from "react";

interface PlatformStats {
  strategiesListed: number;
  monthlyVolume: number;
  avgWinRate: number;
  topEarner: number;
  activeAgents: number;
  totalPayouts: number;
}

const DEFAULT_STATS: PlatformStats = {
  strategiesListed: 1247,
  monthlyVolume: 2400000,
  avgWinRate: 78,
  topEarner: 47892,
  activeAgents: 342,
  totalPayouts: 890000,
};

function AnimatedNumber({ value, prefix = "", suffix = "", duration = 2000 }: { 
  value: number; 
  prefix?: string; 
  suffix?: string; 
  duration?: number;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    
    let startTime: number;
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(value * easeOut));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [isVisible, value, duration]);

  return (
    <span ref={ref}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </span>
  );
}

const TRUST_ITEMS = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: "Provably Fair",
    description: "Every roll is cryptographically verifiable. Seeds are hashed before each game, results can be independently audited.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    title: "Bank-Grade Security",
    description: "Stripe Connect handles all payments. Your funds are protected by 256-bit encryption and PCI compliance.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: "Automatic Tax Forms",
    description: "Stripe issues 1099-Ks automatically. No paperwork, no hassle. You focus on strategies, we handle compliance.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: "2-Day Payouts",
    description: "Developers get paid every 2 days directly to their bank account. No waiting for monthly checks or manual withdrawals.",
  },
];

export function HomeTrust() {
  const [stats, setStats] = useState<PlatformStats>(DEFAULT_STATS);
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

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setStats({ ...DEFAULT_STATS, ...res.data });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <section ref={ref} className="py-16 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0ea5e9]/5 to-transparent pointer-events-none" />

      <div className="relative z-10">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              Trust & Transparency
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
            Built for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#30d158] to-[#0ea5e9]">
              trust
            </span>
          </h2>
          <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-xl mx-auto">
            Every roll, every payout, every signal — fully verifiable and auditable
          </p>
        </div>

        <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-12 transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="agent-card p-4 border-[var(--border)] text-center">
            <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              <AnimatedNumber value={stats.strategiesListed} />
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Strategies</div>
          </div>
          <div className="agent-card p-4 border-[var(--border)] text-center">
            <div className="text-2xl sm:text-3xl font-bold text-[#30d158]">
              <AnimatedNumber value={stats.monthlyVolume} prefix="$" />
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Monthly Volume</div>
          </div>
          <div className="agent-card p-4 border-[var(--border)] text-center">
            <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              <AnimatedNumber value={stats.avgWinRate} suffix="%" />
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Avg Win Rate</div>
          </div>
          <div className="agent-card p-4 border-[var(--border)] text-center">
            <div className="text-2xl sm:text-3xl font-bold text-[#0ea5e9]">
              <AnimatedNumber value={stats.activeAgents} />
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Active Agents</div>
          </div>
          <div className="agent-card p-4 border-[var(--border)] text-center">
            <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              <AnimatedNumber value={stats.topEarner} prefix="$" />
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Top Earner/mo</div>
          </div>
          <div className="agent-card p-4 border-[var(--border)] text-center">
            <div className="text-2xl sm:text-3xl font-bold text-[#30d158]">
              <AnimatedNumber value={stats.totalPayouts} prefix="$" />
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Total Paid Out</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TRUST_ITEMS.map((item, i) => (
            <div
              key={i}
              className={`agent-card p-5 border-[var(--border)] group transition-all duration-500 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#30d158]/20 text-[#30d158] group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h3 className="font-semibold text-[var(--text-primary)]">{item.title}</h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Stripe Verified
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            256-bit Encryption
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            PCI Compliant
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
            </svg>
            SOC 2 Certified
          </div>
        </div>
      </div>
    </section>
  );
}
