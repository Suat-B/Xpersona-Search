import { HomeHeroHF } from "@/components/home/HomeHeroHF";
import { TrendingGridHF } from "@/components/home/TrendingGridHF";
import { ExploreCapabilitiesHF } from "@/components/home/ExploreCapabilitiesHF";
import { BuildWithXpersonaHF } from "@/components/home/BuildWithXpersonaHF";
import { RecentActivityHF } from "@/components/home/RecentActivityHF";

export default async function HomeHF() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-deep)]">
      <div className="flex-1">
        <HomeHeroHF />
        <TrendingGridHF />
        <ExploreCapabilitiesHF />
        <RecentActivityHF />
        <BuildWithXpersonaHF />
      </div>
    </div>
  );
}
