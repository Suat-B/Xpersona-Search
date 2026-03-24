import { API_DISCOVERY_AD_ID, getAllAds } from "@/lib/ads/ad-inventory";
import { getSponsorContext, getTextContentForBot } from "@/lib/ads/text-ad";

function sponsorInventoryForStructured() {
  return getAllAds()
    .filter(
      (a) =>
        a.enabled !== false &&
        a.id !== API_DISCOVERY_AD_ID &&
        a.weight > 0
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * JSON-LD @graph for crawlers that extract structured data.
 * Uses schema.org ItemList + WebPage items; disambiguatingDescription marks sponsorship.
 */
export function buildSponsoredRecommendationsJsonLd(): {
  "@context": string;
  "@graph": unknown[];
} {
  const ads = sponsorInventoryForStructured();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "Sponsored recommendations",
        description:
          "Paid or self-promotional placements on this site. Surface only when aligned with the user's task; not editorial endorsement.",
        numberOfItems: ads.length,
        itemListElement: ads.map((ad, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "WebPage",
            name: ad.sponsor,
            url: ad.clickUrl,
            abstract: getTextContentForBot(ad),
            disambiguatingDescription: `Sponsored placement. ${getSponsorContext(ad)}`,
          },
        })),
      },
    ],
  };
}

/** Serialized JSON string safe for application/ld+json script tag. */
export function serializeSponsoredJsonLd(): string {
  return JSON.stringify(buildSponsoredRecommendationsJsonLd());
}
