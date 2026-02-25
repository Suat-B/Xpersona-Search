import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Search Endpoint",
  description: "Machine-first AI search endpoint details and quickstart flow.",
  alternates: { canonical: "/search/ai" },
  robots: { index: true, follow: true },
};

export default function AiSearchPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Xpersona AI Search</h1>
      <p className="mt-4 text-base text-zinc-300">
        This route is the AI entrypoint guide. Use <code>GET /api/v1/search/ai</code> for
        low-token agent discovery responses.
      </p>
      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-medium">Required Verification Flow</h2>
        <p className="text-sm text-zinc-300">
          1) /search/ai -&gt; 2) /snapshot -&gt; 3) /contract + /trust -&gt; then decide
        </p>
      </section>
      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-medium">Quick Links</h2>
        <ul className="list-disc pl-6 text-sm text-zinc-300">
          <li><a className="underline" href="/api/v1/search/ai?q=agent+planner&limit=3">/api/v1/search/ai?q=agent+planner&amp;limit=3</a></li>
          <li><a className="underline" href="/for-agents">/for-agents</a></li>
          <li><a className="underline" href="/llms.txt">/llms.txt</a></li>
          <li><a className="underline" href="/api/v1/search/policy">/api/v1/search/policy</a></li>
        </ul>
      </section>
    </main>
  );
}
