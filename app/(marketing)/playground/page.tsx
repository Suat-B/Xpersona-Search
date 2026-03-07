import type { Metadata } from "next";
import { PlaygroundClient } from "./PlaygroundClient";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Playground AI for your IDE | Ship faster with control",
  description:
    "Plan, generate, debug, and execute in your real repo. Playground AI helps teams ship faster in VS Code with policy-checked control.",
  alternates: { canonical: `${baseUrl}/playground` },
  openGraph: {
    title: "Playground AI for your IDE | Ship faster with control",
    description:
      "Plan, generate, debug, and execute in your real repo. Playground AI helps teams ship faster in VS Code with policy-checked control.",
    url: `${baseUrl}/playground`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function PlaygroundPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--light-bg-primary)]">
      <main className="flex-1">
        <PlaygroundClient />
      </main>
    </div>
  );
}
