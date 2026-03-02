import { TrendingGridHF } from "@/components/home/TrendingGridHF";
import { PublicMarketplace } from "@/components/marketplace/PublicMarketplace";

export default function MarketplacePage() {
  return (
    <>
      <PublicMarketplace />
      <div className="mt-12">
        <TrendingGridHF />
      </div>
    </>
  );
}
