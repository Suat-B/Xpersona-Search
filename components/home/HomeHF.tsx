import HomeClassic from "@/components/home/HomeClassic";
import { TopNavHF } from "@/components/nav/TopNavHF";

export default async function HomeHF({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-deep)]">
      <TopNavHF />
      <div className="flex-1">
        <HomeClassic searchParams={searchParams} basePath="/search" />
      </div>
    </div>
  );
}
