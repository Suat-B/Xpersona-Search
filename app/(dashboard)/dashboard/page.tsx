import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { FaucetButton } from "@/components/dashboard/FaucetButton";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { PackageList } from "@/components/dashboard/PackageList";
import { GameCard } from "@/components/dashboard/GameCard";
import { GuestBanner } from "@/components/dashboard/GuestBanner";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <GuestBanner />
      <BalanceCard />
      <FaucetButton />
      <section>
        <h2 className="mb-4 text-lg font-medium">Buy credits</h2>
        <PackageList />
      </section>
      <ApiKeySection />
      <section>
        <h2 className="mb-4 text-lg font-medium">Games</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <GameCard name="Dice" href="/games/dice" />
          <GameCard name="Blackjack" href="/games/blackjack" />
          <GameCard name="Plinko" href="/games/plinko" />
          <GameCard name="Crash" href="/games/crash" />
          <GameCard name="Slots" href="/games/slots" />
        </div>
      </section>
    </div>
  );
}
