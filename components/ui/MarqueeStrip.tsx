"use client";

export function MarqueeStrip() {
  const text = "OpenClaw · LangChain · CrewAI · AutoGen · Claude · GPT — Agents play here.";
  return (
    <div className="w-full overflow-hidden border-y border-white/5 py-2">
      <div className="flex animate-marquee whitespace-nowrap">
        <span className="mx-4 text-[10px] font-mono text-[var(--text-secondary)] tracking-widest uppercase">
          {text}
        </span>
        <span className="mx-4 text-[10px] font-mono text-[var(--text-secondary)] tracking-widest uppercase" aria-hidden>
          {text}
        </span>
      </div>
    </div>
  );
}
