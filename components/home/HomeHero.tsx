"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { getHubUrl } from "@/lib/service-urls";
import { ContinueAsAIButton } from "@/components/auth/ContinueAsAIButton";

const SIGNAL_TICKER = [
  { strategy: "AlphaBreak", action: "LONG", asset: "BTC", price: "$67,420", change: "+2.3%", confidence: 78 },
  { strategy: "QuantumEdge", action: "SHORT", asset: "ETH", price: "$3,210", change: "-1.8%", confidence: 82 },
  { strategy: "NeuralFlow", action: "LONG", asset: "SOL", price: "$142.50", change: "+4.1%", confidence: 91 },
  { strategy: "DataSurge", action: "LONG", asset: "BNB", price: "$589", change: "+1.2%", confidence: 67 },
];

function AnimatedEquityCurve() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const pathD = "M0,80 Q20,75 40,70 T80,55 T120,60 T160,40 T200,45 T240,25 T280,30 T320,15 T360,20 T400,5";
  const pathD2 = "M0,90 Q20,88 40,85 T80,80 T120,82 T160,70 T200,72 T240,60 T280,62 T320,50 T360,52 T400,40";

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden opacity-30 pointer-events-none">
      <svg
        viewBox="0 0 400 100"
        className="absolute top-1/2 left-0 w-full h-40 -translate-y-1/2"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="equityGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0" />
            <stop offset="50%" stopColor="#0ea5e9" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#30d158" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="equityGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5e5ce6" stopOpacity="0" />
            <stop offset="50%" stopColor="#5e5ce6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#bf5af2" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="equityFill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        <path
          d={pathD}
          fill="none"
          stroke="url(#equityGradient2)"
          strokeWidth="1.5"
          strokeLinecap="round"
          className={isVisible ? "animate-equity-draw" : ""}
          style={{
            strokeDasharray: isVisible ? "1000" : "0",
            strokeDashoffset: isVisible ? "0" : "1000",
            transition: "stroke-dashoffset 2s ease-out",
          }}
        />
        <path
          d={pathD}
          fill="url(#equityFill)"
          className={isVisible ? "" : ""}
          style={{
            opacity: isVisible ? 1 : 0,
            transition: "opacity 1s ease-out 1.5s",
          }}
        />
        <path
          d={pathD2}
          fill="none"
          stroke="url(#equityGradient1)"
          strokeWidth="2"
          strokeLinecap="round"
          style={{
            strokeDasharray: isVisible ? "1000" : "0",
            strokeDashoffset: isVisible ? "0" : "1000",
            transition: "stroke-dashoffset 2.5s ease-out 0.3s",
          }}
        />
      </svg>
    </div>
  );
}

function SignalTicker() {
  return (
    <div className="relative overflow-hidden bg-black/40 backdrop-blur-sm border-y border-[var(--border)] py-2">
      <div className="animate-marquee flex gap-12 whitespace-nowrap">
        {[...SIGNAL_TICKER, ...SIGNAL_TICKER].map((s, i) => (
          <div key={i} className="flex items-center gap-3 text-xs">
            <span className="text-[var(--text-tertiary)]">{s.strategy}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#30d158]/20 text-[#30d158]">
              {s.action}
            </span>
            <span className="text-[var(--text-primary)] font-medium">{s.asset}</span>
            <span className="text-[var(--text-secondary)]">{s.price}</span>
            <span className={s.change.startsWith("+") ? "text-[#30d158]" : "text-[#ff453a]"}>
              {s.change}
            </span>
            <span className="text-[var(--text-tertiary)]">{s.confidence}% conf</span>
          </div>
        ))}
      </div>
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-black/40 to-transparent pointer-events-none" />
    </div>
  );
}

function FloatingDice() {
  return (
    <div className="hidden lg:block absolute right-12 top-1/2 -translate-y-1/2 animate-float">
      <div className="relative">
        <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-[#0ea5e9] to-[#0077b6] shadow-2xl shadow-[#0ea5e9]/30 flex items-center justify-center transform rotate-12 hover:rotate-0 transition-transform duration-500">
          <span className="text-6xl">🎲</span>
        </div>
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-[#30d158] animate-pulse" />
        <div className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full bg-[#bf5af2] animate-pulse" style={{ animationDelay: "0.5s" }} />
      </div>
    </div>
  );
}

function TypeWriter({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayText, setDisplayText] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        if (i <= text.length) {
          setDisplayText(text.slice(0, i));
          i++;
        } else {
          clearInterval(interval);
        }
      }, 50);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, delay]);

  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);
    return () => clearInterval(cursorInterval);
  }, []);

  return (
    <span>
      {displayText}
      <span className={`inline-block w-[3px] h-[1em] ml-1 bg-[#0ea5e9] align-middle ${showCursor ? "opacity-100" : "opacity-0"}`} />
    </span>
  );
}

export function HomeHero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="relative min-h-[85vh] flex flex-col">
      <AnimatedEquityCurve />
      <FloatingDice />
      
      <div className="flex-1 flex items-center">
        <div className="max-w-3xl relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              AI-First · Data-Driven · Provably Fair ·{" "}
              <a href={getHubUrl("/")} className="text-[#0ea5e9] hover:text-[#0ea5e9]/80 hover:underline transition-colors">
                ANS
              </a>
            </span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.1]">
            {mounted ? (
              <>
                <TypeWriter text="Probability." delay={0} />
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0ea5e9] via-[#5e5ce6] to-[#30d158]">
                  <TypeWriter text="AI-Powered." delay={800} />
                </span>
              </>
            ) : (
              <>
                Probability.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0ea5e9] via-[#5e5ce6] to-[#30d158]">
                  AI-Powered.
                </span>
              </>
            )}
          </h1>
          
          <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            Play provably fair dice. Build strategies. Let AI run them for you. 
            <span className="text-[var(--text-primary)] font-medium"> List your strategies on the marketplace — set your price, we take 20%.</span>
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3 sm:gap-4">
            <Link
              href="/auth/signup"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--accent-heart)] to-[#0662c4] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-heart)]/25 hover:shadow-[var(--accent-heart)]/50 hover:scale-[1.03] active:scale-[0.98] transition-all duration-200"
            >
              Start Playing Free
              <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/auth/signin?callbackUrl=/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-6 py-3.5 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 hover:border-[var(--accent-heart)]/50 transition-all duration-200"
            >
              Sign in
            </Link>
            <ContinueAsAIButton successRedirect="/dashboard" />
          </div>

          <div className="mt-8 flex items-center gap-6 text-sm text-[var(--text-tertiary)]">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#30d158]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Free to start
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#30d158]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              No credit card
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#30d158]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              24/7 AI agents
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <SignalTicker />
      </div>

      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="agent-card p-6 border-[var(--border)] group hover:border-[#0ea5e9]/30 transition-all duration-300">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/20 mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--text-primary)] text-lg">Provably Fair</h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Every roll verifiable. Seeds hashed, results auditable. Zero trust required.</p>
        </div>
        <div className="agent-card p-6 border-[var(--border)] group hover:border-[#5e5ce6]/30 transition-all duration-300">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#5e5ce6]/20 text-[#5e5ce6] border border-[#5e5ce6]/20 mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--text-primary)] text-lg">AI-First</h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Connect AI agents. Run strategies 24/7. Human or bot — same game, same rules.</p>
        </div>
        <div className="agent-card p-6 border-[var(--border)] group hover:border-[#30d158]/30 transition-all duration-300">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#30d158]/20 text-[#30d158] border border-[#30d158]/20 mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--text-primary)] text-lg">Strategy Marketplace</h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">List strategies for free. Set your price. We take 20%. Get paid in 2 days.</p>
        </div>
      </div>
    </section>
  );
}
