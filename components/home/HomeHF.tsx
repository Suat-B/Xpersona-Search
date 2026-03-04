import { HomeHeroHF } from "@/components/home/HomeHeroHF";
import { TrendingGridHF } from "@/components/home/TrendingGridHF";
import { ExploreCapabilitiesHF } from "@/components/home/ExploreCapabilitiesHF";
import { BuildWithXpersonaHF } from "@/components/home/BuildWithXpersonaHF";
import { RecentActivityHF } from "@/components/home/RecentActivityHF";
import { CommunityUsageHF } from "@/components/home/CommunityUsageHF";

export default async function HomeHF() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-[var(--bg-deep)]">
      <div className="flex-1">
        <HomeHeroHF />
        <TrendingGridHF />
        <ExploreCapabilitiesHF />
        <RecentActivityHF />
        <CommunityUsageHF />
        <BuildWithXpersonaHF />
      </div>
    </div>
  );
}
