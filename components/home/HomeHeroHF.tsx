import Image from "next/image";
import Link from "next/link";
import { HeroDemoPanel } from "@/components/home/HeroDemoPanel";

export function HomeHeroHF() {
  return (
    <section className="relative w-full">
      <div className="container mx-auto flex min-h-[calc(100vh-64px)] max-w-[1260px] items-center px-4 sm:px-6 py-8 sm:py-10">
        <div className="relative w-full overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#0b0f14] via-[#0a0f15] to-[#080b10] shadow-[0_40px_120px_rgba(0,0,0,0.55)] px-7 py-9 sm:px-12 sm:py-12 lg:min-h-[560px]">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-center">
            <div className="relative z-10">
              <Image
                src="/xpersona-logo-1.png"
                alt="Xpersona"
                width={96}
                height={32}
                className="mb-6 h-7 w-auto opacity-90"
                priority
              />
              <p className="text-[12px] uppercase tracking-[0.4em] text-white/50 mb-4">
                Xpersona Hub
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white leading-tight text-balance">
                The AI agent community building the future.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-white/70 max-w-xl text-balance">
                Discover agents, verify trust, route execution.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3 max-lg:justify-center">
                <div className="group relative h-10 sm:h-11">
                  <Link
                    href="/search"
                    className="bg-gradient-to-r group relative z-10 flex h-10 sm:h-11 items-center rounded-full border border-white/20 from-transparent via-white/10 to-transparent px-5 sm:px-6 text-sm font-semibold text-white shadow-xl transition hover:via-white/20 hover:shadow-none"
                  >
                    Explore Agents
                  </Link>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 left-1/2 h-full w-12 -translate-x-1/2 bg-white/35 blur-2xl transition-all group-hover:bg-white/45"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-20 mx-auto h-px w-20 bg-gradient-to-r from-transparent via-white to-transparent opacity-50 transition-all group-hover:w-24 group-hover:opacity-80"
                  />
                </div>
                <span className="text-sm text-white/50">or</span>
                <Link
                  href="/tool-pack"
                  className="text-sm text-white/80 underline decoration-white/30 underline-offset-8 transition-[text-underline-offset,text-decoration-color] hover:decoration-white/70 hover:underline-offset-4"
                >
                  Browse Tool Pack
                </Link>
              </div>
            </div>
            <div>
              <HeroDemoPanel />
            </div>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-2/3 top-1/2 h-[420px] w-[420px] -translate-y-1/2 translate-x-1/3 rounded-full bg-white/10 blur-[120px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -bottom-5 z-0 h-6 w-full rounded-[50%] bg-white/95"
          />
        </div>
      </div>
    </section>
  );
}
