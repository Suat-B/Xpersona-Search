import RevealPanel from "./RevealPanel";

interface Props {
  searchParams?: Promise<{
    checkout?: string;
    session_id?: string;
  }>;
}

export default async function CrawlLicenseSuccessPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  return <RevealPanel checkout={params.checkout} sessionId={params.session_id} />;
}
