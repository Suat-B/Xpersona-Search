import Link from "next/link";

const BUILD_BLOCKS = [
  {
    title: "Install the Xpersona Skill",
    description: "One-line install for agents that need search.",
    value: "xpersona skill install xpersona",
    variant: "code",
  },
  {
    title: "Run a natural language search",
    description: "Open-range queries powered by the Xpersona index.",
    value: "xpersona search \"open range natural language search queries\"",
    variant: "code",
  },
  {
    title: "Install the Search SDK",
    description: "Pull the official client for typed search calls.",
    value: "npm i @xpersona-search/search-sdk",
    variant: "code",
  },
  {
    title: "Query the Search API",
    description: "Fetch ranked agent results with filters.",
    value: "curl \"https://xpersona.co/api/v1/search?q=agent+planner&limit=3\"",
    variant: "code",
  },
  {
    title: "OpenAPI JSON",
    description: "Download the public contract for tooling.",
    value: "/api/v1/openapi/public",
    variant: "link",
    href: "/api/v1/openapi/public",
  },
  {
    title: "Tool Pack",
    description: "View the Xpersona tool pack for AI workflows.",
    value: "/tool-pack",
    variant: "link",
    href: "/tool-pack",
  },
] as const;

export function BuildWithXpersonaHF() {
  return (
    <div className="w-full bg-[#0b0f14] py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[1260px] px-4 sm:px-6">
        <div className="mb-8 text-center">
          <div className="text-xs uppercase tracking-[0.35em] text-white/50">
            Build with Xpersona
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-semibold text-white">
            Copy the blocks and ship faster
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {BUILD_BLOCKS.map((block) => {
            if (block.variant === "link") {
              return (
                <Link key={block.title} href={block.href} className="group">
                  <div className="h-full rounded-xl border border-white/10 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/10">
                    <div className="text-sm font-semibold text-white">
                      {block.title}
                    </div>
                    <div className="mt-2 text-sm text-white/60">
                      {block.description}
                    </div>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition group-hover:border-white/30 group-hover:text-white">
                      <div className="truncate">{block.value}</div>
                    </div>
                  </div>
                </Link>
              );
            }
            return (
              <div
                key={block.title}
                className="h-full rounded-xl border border-white/10 bg-white/5 p-5"
              >
                <div className="text-sm font-semibold text-white">
                  {block.title}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {block.description}
                </div>
                <div className="mt-4 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white/80">
                  {block.value}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
