import Link from "next/link";
import Image from "next/image";
import { normalizeCapabilityToken } from "@/lib/search/capability-tokens";

const CAPABILITIES = [
  {
    name: "PDF",
    detail: "Extract, analyze, and transform documents.",
    query: "PDF",
    icon:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'><rect width='36' height='36' rx='10' fill='%23ef4444'/><path d='M11 24h14v-2H11v2zm0-4h14v-2H11v2zm0-4h10v-2H11v2z' fill='white'/></svg>",
  },
  {
    name: "Research",
    detail: "Synthesize sources into concise insights.",
    query: "Research",
    icon:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'><rect width='36' height='36' rx='10' fill='%233b82f6'/><path d='M14 12h8v2h-8v-2zm0 4h8v2h-8v-2zm-3 6h14v2H11v-2z' fill='white'/></svg>",
  },
  {
    name: "Web browsing",
    detail: "Navigate live sites and gather context.",
    query: "Web browsing",
    icon:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'><rect width='36' height='36' rx='10' fill='%2322c55e'/><path d='M12 12h12v10H12V12zm-2 12h16v2H10v-2z' fill='white'/></svg>",
  },
  {
    name: "Codegen",
    detail: "Generate, refactor, and review code.",
    query: "Codegen",
    icon:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'><rect width='36' height='36' rx='10' fill='%238b5cf6'/><path d='M12 18l4-4 2 2-2 2 2 2-2 2-4-4zm12 0l-4-4-2 2 2 2-2 2 2 2 4-4z' fill='white'/></svg>",
  },
  {
    name: "Voice",
    detail: "Interact through speech and audio flows.",
    query: "Voice",
    icon:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'><rect width='36' height='36' rx='10' fill='%23f97316'/><path d='M18 10a3 3 0 00-3 3v6a3 3 0 006 0v-6a3 3 0 00-3-3zm-6 8a6 6 0 0012 0h2a8 8 0 01-7 7v3h-2v-3a8 8 0 01-7-7h2z' fill='white'/></svg>",
  },
] as const;

export function ExploreCapabilitiesHF() {
  return (
    <section className="w-full bg-[#0b0f14] py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[1260px] px-4 sm:px-6">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">
            Explore by capability
          </p>
          <p className="mt-3 text-2xl sm:text-3xl font-semibold text-white">
            Find agents built for your workflows
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {CAPABILITIES.map((capability) => (
            <Link
              key={capability.name}
              href={`/search?capabilities=${encodeURIComponent(normalizeCapabilityToken(capability.query))}`}
              className="group"
            >
              <div className="flex h-full flex-col justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10">
                <div className="flex items-center gap-3">
                  <Image
                    src={capability.icon}
                    alt={`${capability.name} icon`}
                    width={36}
                    height={36}
                    unoptimized
                    className="h-9 w-9"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {capability.name}
                    </p>
                    <p className="text-xs text-white/60">
                      {capability.detail}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-white/60">
                  View results
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
