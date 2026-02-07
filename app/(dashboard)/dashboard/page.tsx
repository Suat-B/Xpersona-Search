import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { FaucetButton } from "@/components/dashboard/FaucetButton";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { PackageList } from "@/components/dashboard/PackageList";
import { StrategiesSection } from "@/components/strategies/StrategiesSection";
import { GlassCard } from "@/components/ui/GlassCard";
import { GuestBanner } from "@/components/dashboard/GuestBanner";

export default function DashboardPage() {
  return (
    <div className="space-y-10 animate-fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold font-[family-name:var(--font-outfit)]">Dashboard</h1>
        <p className="text-text-secondary">Overview of your credits and protocol activity.</p>
      </div>

      <GuestBanner />

      {/* Stats Section */}
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="col-span-2 lg:col-span-2">
          <GlassCard className="h-full bg-gradient-to-br from-white/5 to-transparent">
            <div className="flex items-center justify-between h-full">
              <BalanceCard />
              <div className="ml-4">
                <FaucetButton />
              </div>
            </div>
          </GlassCard>
        </div>
        {/* Placeholder for future stats or chart */}
        <GlassCard className="col-span-2 lg:col-span-1 border-dashed border-white/10 flex items-center justify-center min-h-[150px]">
          <span className="text-xs text-text-secondary uppercase tracking-widest">Activity Chart (Coming Soon)</span>
        </GlassCard>
      </section>

      {/* Buy Credits */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Buy Credits</h2>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-sm">
          <PackageList />
        </div>
      </section>

      <ApiKeySection />

      {/* My strategies (create, list, run — OpenClaw-friendly) */}
      <section id="strategies">
        <StrategiesSection />
      </section>

      {/* Games Grid */}
      <section>
        <h2 className="text-xl font-semibold mb-6">Available Protocols</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <GameTile name="Dice" href="/games/dice" />
          <GameTile name="Blackjack" href="/games/blackjack" />
          <GameTile name="Plinko" href="/games/plinko" />
          <GameTile name="Crash" href="/games/crash" />
          <GameTile name="Slots" href="/games/slots" />
        </div>
      </section>
    </div>
  );
}

function GameTile({ name, href }: { name: string; href: string }) {
  return (
    <GlassCard href={href} glow className="h-24 flex items-center justify-center hover:bg-white/5 bg-bg-card">
      <span className="text-lg font-bold font-[family-name:var(--font-outfit)]">{name}</span>
    </GlassCard>
  )
}
