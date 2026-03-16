import Image from "next/image";
import Link from "next/link";
import HeroDemoPanel from "@/components/home/HeroDemoPanel";

export function HomeHeroHF() {
  return (
    <section className="relative w-full">
      <div className="container mx-auto flex min-h-[calc(100dvh-64px)] max-w-[1260px] items-start justify-center px-3 py-5 sm:items-center sm:px-6 sm:py-10">
        <div className="relative w-full max-w-[1100px] overflow-hidden rounded-[26px] bg-gradient-to-br from-[#0b0f14] via-[#0a0f15] to-[#080b10] px-4 py-6 shadow-[0_40px_120px_rgba(0,0,0,0.55)] sm:rounded-[32px] sm:px-12 sm:py-12 lg:min-h-[560px]">
          <div className="grid items-center gap-6 sm:gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="relative z-10 mx-auto w-full max-w-[580px] text-center sm:text-left">
              <Image
                src="/xpersona-logo-1.png"
                alt="Xpersona"
                width={96}
                height={32}
                className="mb-4 h-6 w-auto opacity-90 sm:mb-6 sm:h-7 mx-auto sm:mx-0"
                priority
              />
              <p className="text-[12px] uppercase tracking-[0.4em] text-white/50 mb-4">
                Xpersona Search
              </p>
              <h1 className="text-[2.05rem] font-semibold leading-[1.12] text-white text-balance sm:text-5xl sm:leading-tight lg:text-6xl">
                Search agents, skills, models and more...
              </h1>
              <p className="mt-4 max-w-xl text-[15px] text-white/70 text-balance sm:mt-5 sm:text-lg mx-auto sm:mx-0">
                Discover agents, verify trust, route execution.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3 max-lg:justify-center sm:mt-8">
                <div className="group relative h-10 sm:h-11">
                  <Link
                    href="/search"
                    className="group relative z-10 flex h-10 sm:h-11 items-center rounded-full border border-[var(--accent-heart)]/35 bg-[#15191f] px-5 sm:px-6 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,0,0,0.45)] transition-all hover:border-[var(--accent-heart)]/60 hover:bg-[#101318]"
                  >
                    Explore Agents
                  </Link>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 left-1/2 h-full w-14 -translate-x-1/2 bg-[var(--accent-heart)]/30 blur-2xl transition-all group-hover:bg-[var(--accent-heart)]/45"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-20 mx-auto h-px w-20 bg-gradient-to-r from-transparent via-[var(--accent-heart)] to-transparent opacity-65 transition-all group-hover:w-24 group-hover:opacity-95"
                  />
                </div>
                <span className="text-sm text-white/50 max-sm:text-xs">or</span>
                <Link
                  href="/tool-pack"
                  className="text-sm text-white/80 underline decoration-white/30 underline-offset-8 transition-[text-underline-offset,text-decoration-color] hover:decoration-white/70 hover:underline-offset-4 max-sm:text-[13px]"
                >
                  Browse Tool Pack
                </Link>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[500px] lg:max-w-none">
              <HeroDemoPanel />
            </div>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-2/3 top-1/2 h-[420px] w-[420px] -translate-y-1/2 translate-x-1/3 rounded-full bg-white/10 blur-[120px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -bottom-5 z-0 h-6 w-full rounded-[50%] bg-black"
          />
        </div>
      </div>
    </section>
  );
}
