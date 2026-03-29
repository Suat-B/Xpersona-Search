import { TrendingGridHF } from "@/components/home/TrendingGridHF";
import { RecentActivityHF } from "@/components/home/RecentActivityHF";

export default async function HomeHF() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-white">
      <div className="flex-1">
        <TrendingGridHF />
        <RecentActivityHF />
      </div>
    </div>
  );
}
