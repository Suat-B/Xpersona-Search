import type { Metadata } from "next";
import { PlaygroundClient } from "./PlaygroundClient";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Playground AI for VS Code | Start Free Trial",
  description:
    "Your coding copilot workspace for shipping faster. Generate, plan, and debug with Playground AI in a ChatGPT/Codex/Claude Code-style workflow.",
  alternates: { canonical: `${baseUrl}/playground` },
  openGraph: {
    title: "Playground AI for VS Code | Start Free Trial",
    description:
      "Generate, plan, and debug faster with Playground AI. Premium coding workflows designed for developers and teams.",
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

