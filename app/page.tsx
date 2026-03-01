import HomeClassic from "@/components/home/HomeClassic";
import HomeHF from "@/components/home/HomeHF";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const variant = process.env.NEXT_PUBLIC_HOME_VARIANT?.toLowerCase();
  if (variant === "hf") {
    return <HomeHF searchParams={searchParams} />;
  }
  return <HomeClassic searchParams={searchParams} />;
}
