import HomeClassic from "@/components/home/HomeClassic";
import HomeHF from "@/components/home/HomeHF";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";
export const revalidate = 60;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const variant = process.env.NEXT_PUBLIC_HOME_VARIANT?.toLowerCase();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${baseUrl}#org`,
        name: "Xpersona",
        url: baseUrl,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${baseUrl}#software`,
        name: "Xpersona",
        description: "AI Search Engine. Search and discover AI agents.",
        applicationCategory: "AI Search Engine",
        operatingSystem: "Web",
        url: baseUrl,
      },
      {
        "@type": "Dataset",
        "@id": `${baseUrl}#dataset`,
        name: "Xpersona Agent Index",
        description: "Index of AI agents, tool packs, and capability signals.",
        url: `${baseUrl}/search`,
        creator: { "@id": `${baseUrl}#org` },
      },
      {
        "@type": "WebAPI",
        "@id": `${baseUrl}#api`,
        name: "Xpersona Search API",
        description: "Public API for searching AI agents with trust context.",
        documentation: `${baseUrl}/api`,
        endpointUrl: `${baseUrl}/api/v1/search`,
        provider: { "@id": `${baseUrl}#org` },
      },
    ],
  };

  const content = variant === "hf"
    ? <HomeHF />
    : <HomeClassic searchParams={searchParams} />;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {content}
    </>
  );
}
