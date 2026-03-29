import { NextResponse } from "next/server";
import {
  getAgentSitemapEntries,
  getCoreSitemapEntries,
  getMcpSitemapEntries,
  getSkillSitemapEntries,
  getTaxonomySitemapEntries,
  renderUrlSet,
  sliceAgentEntries,
} from "@/lib/seo/sitemaps";

export const revalidate = 300;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  let xml: string | null = null;

  if (name === "core.xml") {
    xml = renderUrlSet(await getCoreSitemapEntries());
  } else if (name === "taxonomy.xml") {
    xml = renderUrlSet(await getTaxonomySitemapEntries());
  } else {
    const agentMatch = /^agents-(\d+)\.xml$/i.exec(name);
    const skillMatch = /^skills-(\d+)\.xml$/i.exec(name);
    const mcpMatch = /^mcps-(\d+)\.xml$/i.exec(name);
    if (agentMatch?.[1]) {
      const chunkNumber = Number(agentMatch[1]);
      const entries = sliceAgentEntries(await getAgentSitemapEntries(), chunkNumber);
      if (entries.length > 0) {
        xml = renderUrlSet(entries);
      }
    } else if (skillMatch?.[1]) {
      const chunkNumber = Number(skillMatch[1]);
      const entries = sliceAgentEntries(await getSkillSitemapEntries(), chunkNumber);
      if (entries.length > 0) {
        xml = renderUrlSet(entries);
      }
    } else if (mcpMatch?.[1]) {
      const chunkNumber = Number(mcpMatch[1]);
      const entries = sliceAgentEntries(await getMcpSitemapEntries(), chunkNumber);
      if (entries.length > 0) {
        xml = renderUrlSet(entries);
      }
    }
  }

  if (!xml) {
    return NextResponse.json(
      {
        success: false,
        error: "SITEMAP_NOT_FOUND",
      },
      { status: 404 }
    );
  }

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
