import type { Metadata } from "next";
import {
  generatePublicEntityMetadata,
  renderPublicEntityPage,
} from "@/lib/entities/public-entity-page";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return generatePublicEntityMetadata(slug, "mcp");
}

export default async function McpPage({ params, searchParams }: Props) {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  return renderPublicEntityPage({
    slug,
    rawFrom: rawSearchParams?.from,
    expectedEntityType: "mcp",
  });
}
