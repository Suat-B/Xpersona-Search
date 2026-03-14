import { HomeHeroHF } from "@/components/home/HomeHeroHF";
import { TrendingGridHF } from "@/components/home/TrendingGridHF";
import { RecentActivityHF } from "@/components/home/RecentActivityHF";

export default async function HomeHF() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-[var(--bg-deep)]">
      <div className="flex-1">
        <HomeHeroHF />
        <TrendingGridHF />
        <RecentActivityHF />
      </div>
    </div>
  );
}
