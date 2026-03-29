import { NextResponse } from "next/server";
import { getSitemapDescriptors, renderSitemapIndex } from "@/lib/seo/sitemaps";

export const revalidate = 300;

export async function GET() {
  const descriptors = await getSitemapDescriptors();
  return new NextResponse(renderSitemapIndex(descriptors), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
