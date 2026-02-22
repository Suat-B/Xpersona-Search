import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { getService } from "@/lib/service";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeHub } from "@/components/home/HomeHub";
import { SearchLanding } from "@/components/home/SearchLanding";
import { GoogleStyleHomeClient as GoogleStyleHome } from "@/components/home/GoogleStyleHomeClient";
import { getHubUrl } from "@/lib/service-urls";
import { HomeStrategies } from "@/components/home/HomeStrategies";
import { HomeFlow } from "@/components/home/HomeFlow";
import { HomeTrust } from "@/components/home/HomeTrust";
import { HomeSignalPreview } from "@/components/home/HomeSignalPreview";
import { HomePricing } from "@/components/home/HomePricing";
import { HomeDeveloperCTA } from "@/components/home/HomeDeveloperCTA";
import { Footer } from "@/components/home/Footer";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; hub?: string; protocols?: string; browse?: string }>;
}) {
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
  const params = await searchParams;
  const hasSearchQuery = !!params?.q?.trim();
  const hasProtocolFilter = !!params?.protocols?.trim();
  const hasBrowse = params?.browse === "1" || params?.browse === "true";
  const forceHub = params?.hub === "1" || params?.hub === "true";

  if (service === "hub" || forceHub) {
    if (!hasSearchQuery && !hasProtocolFilter && !hasBrowse) {
      return (
        <GoogleStyleHome
          isAuthenticated={isAuthenticated}
          privacyUrl={getHubUrl("/privacy-policy-1")}
          termsUrl={getHubUrl("/terms-of-service")}
        />
      );
    }
    return (
      <div className="min-h-screen flex flex-col">
        <ANSMinimalHeader isAuthenticated={isAuthenticated} variant="dark" />
        <div className="flex-1">
          <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-[var(--text-tertiary)]">Loading search…</div>}>
            <SearchLanding />
          </Suspense>
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
