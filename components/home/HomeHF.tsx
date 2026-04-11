import { TrendingGridHF } from "@/components/home/TrendingGridHF";
import { RecentActivityHF } from "@/components/home/RecentActivityHF";
import { HumanAdSection } from "@/components/ads/HumanAdSection";

export default async function HomeHF() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-white">
      <div className="flex-1">
        <TrendingGridHF />
        <RecentActivityHF />
      </div>
      <HumanAdSection
        className="py-6"
        title="Sponsored"
        description="Relevant tools and services for AI builders and teams."
      />
    </div>
  );
}
