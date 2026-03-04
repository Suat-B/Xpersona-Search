import type { Metadata } from "next";
import { PlaygroundClient } from "./PlaygroundClient";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Playground AI for VS Code | Start Free Trial",
  description:
    "Your coding copilot workspace for shipping faster. Powered by our in-house model, Playground <3 pure love <3, for generate, plan, and debug workflows.",
  alternates: { canonical: `${baseUrl}/playground` },
  openGraph: {
    title: "Playground AI for VS Code | Start Free Trial",
    description:
      "Powered by our in-house model, Playground <3 pure love <3. Generate, plan, and debug faster with premium coding workflows.",
    url: `${baseUrl}/playground`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function PlaygroundPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="flex-1">
        <PlaygroundClient />
      </main>
    </div>
  );
}

