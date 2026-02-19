"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

const EXAMPLE_SIGNAL = {
  strategy: "AlphaBreak v2.1",
  asset: "BTC/USDT",
  action: "LONG",
  price: "$67,420",
  stop: "$66,800",
  stopPercent: "-0.9%",
  target: "$69,000",
  targetPercent: "+2.3%",
  confidence: 78,
};

const INTEGRATIONS = [
  { name: "Discord", icon: "💬", desc: "Real-time signals in private channels" },
  { name: "Webhook", icon: "🔗", desc: "Custom API for auto-execution" },
  { name: "Email", icon: "📧", desc: "Backup delivery for every signal" },
  { name: "Push", icon: "📱", desc: "Mobile notifications on the go" },
];

export function HomeSignalPreview() {
  const [isVisible, setIsVisible] = useState(false);
  const [showSignal, setShowSignal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setTimeout(() => setShowSignal(true), 500);
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-[#5865F2]/5 via-transparent to-[#30d158]/5 pointer-events-none" />

      <div className="relative z-10">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#5865F2] animate-pulse" />
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              Signal Delivery
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
            Signals delivered{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#5865F2] to-[#30d158]">
              your way
            </span>
          </h2>
          <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-xl mx-auto">
            Get trading signals via Discord, webhook, email, or mobile push — whatever fits your workflow
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}>
            <div className="agent-card p-6 border-[var(--border)] max-w-md mx-auto lg:mx-0">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--border)]">
                <div className="w-10 h-10 rounded-xl bg-[#5865F2] flex items-center justify-center text-white text-xl">
                  🚨
                </div>
                <div>
                  <div className="text-xs text-[var(--text-tertiary)]">Xpersona Signal</div>
                  <div className="font-semibold text-[var(--text-primary)]">{EXAMPLE_SIGNAL.strategy}</div>
                </div>
              </div>

              {showSignal && (
                <div className="space-y-3 animate-fade-in-up">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--text-tertiary)]">Asset</span>
                    <span className="font-medium text-[var(--text-primary)]">{EXAMPLE_SIGNAL.asset}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--text-tertiary)]">Action</span>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#30d158]/20 text-[#30d158]">
                      {EXAMPLE_SIGNAL.action}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--text-tertiary)]">Entry</span>
                    <span className="font-mono text-[var(--text-primary)]">{EXAMPLE_SIGNAL.price}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--text-tertiary)]">Stop Loss</span>
                    <div className="text-right">
                      <span className="font-mono text-[#ff453a]">{EXAMPLE_SIGNAL.stop}</span>
                      <span className="text-xs text-[#ff453a] ml-1">{EXAMPLE_SIGNAL.stopPercent}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--text-tertiary)]">Target</span>
                    <div className="text-right">
                      <span className="font-mono text-[#30d158]">{EXAMPLE_SIGNAL.target}</span>
                      <span className="text-xs text-[#30d158] ml-1">{EXAMPLE_SIGNAL.targetPercent}</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-[var(--border)]">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-[var(--text-tertiary)]">Confidence</span>
                      <span className="text-xs font-medium text-[var(--text-primary)]">{EXAMPLE_SIGNAL.confidence}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-[#30d158] to-[#0ea5e9]"
                        style={{ width: showSignal ? `${EXAMPLE_SIGNAL.confidence}%` : "0%", transition: "width 1s ease-out" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={`transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}>
            <div className="grid grid-cols-2 gap-4">
              {INTEGRATIONS.map((int, i) => (
                <div
                  key={i}
                  className="agent-card p-4 border-[var(--border)] group hover:border-[#5865F2]/30 transition-all duration-300"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{int.icon}</span>
                    <span className="font-semibold text-[var(--text-primary)]">{int.name}</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{int.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 agent-card p-4 border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">Signal Preferences</div>
                  <div className="text-xs text-[var(--text-tertiary)]">Configure in dashboard settings</div>
                </div>
                <Link
                  href="/dashboard/settings"
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-[#5865F2]/20 text-[#5865F2] hover:bg-[#5865F2]/30 transition-colors"
                >
                  Configure
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
