import type { Metadata } from "next";
import { PlaygroundClient } from "./PlaygroundClient";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Playground AI for Reasoning | Xpersona",
  description: "Build faster with Playground AI for reasoning. All price tiers include the same powerful AI model. Start your free trial today.",
  alternates: { canonical: `${baseUrl}/playground` },
  openGraph: {
    title: "Playground AI for Reasoning | Xpersona",
    description: "Build faster with Playground AI for reasoning. All price tiers include the same powerful AI model.",
    url: `${baseUrl}/playground`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function PlaygroundPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f6f7fb]">
      <main className="flex-1">
        <PlaygroundClient />
      </main>
    </div>
  );
}

