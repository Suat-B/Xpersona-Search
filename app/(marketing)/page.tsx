import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { getService } from "@/lib/service";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeHub } from "@/components/home/HomeHub";
import { SearchLanding } from "@/components/home/SearchLanding";
import { HomeStrategies } from "@/components/home/HomeStrategies";
import { HomeFlow } from "@/components/home/HomeFlow";
import { HomeTrust } from "@/components/home/HomeTrust";
import { HomeSignalPreview } from "@/components/home/HomeSignalPreview";
import { HomePricing } from "@/components/home/HomePricing";
import { HomeDeveloperCTA } from "@/components/home/HomeDeveloperCTA";
import { Footer } from "@/components/home/Footer";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";

export default async function HomePage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // e.g. DB/adapter error
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isAuthenticated = !!(session?.user || userIdFromCookie);
  const service = await getService();

  if (service === "hub") {
    return (
      <div className="min-h-screen flex flex-col">
        <ANSMinimalHeader isAuthenticated={isAuthenticated} variant="dark" />
        <div className="flex-1">
          <SearchLanding />
        </div>
        <ANSMinimalFooter variant="dark" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        {isAuthenticated ? (
          <HomeHub />
        ) : (
          <>
            <HomeHero />
            <HomeStrategies />
            <HomeFlow />
            <HomeTrust />
            <HomeSignalPreview />
            <HomePricing />
            <HomeDeveloperCTA />
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
