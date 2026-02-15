"use client";

export function MarqueeStrip() {
  const text = "OpenClaw · LangChain · CrewAI · AutoGen · Claude · GPT · Advanced Strategy Builder — 38+ triggers, 25+ actions — AI play here.";
  const repeated = Array(4).fill(text).join("  ··  ");
  return (
    <div className="w-full overflow-hidden py-3" aria-hidden>
      <div className="flex animate-marquee whitespace-nowrap w-max">
        <span className="px-6 text-[11px] font-mono text-[var(--text-secondary)] tracking-[0.2em] uppercase">
          {repeated}
        </span>
        <span className="px-6 text-[11px] font-mono text-[var(--text-secondary)] tracking-[0.2em] uppercase" aria-hidden>
          {repeated}
        </span>
      </div>
    </div>
  );
}
