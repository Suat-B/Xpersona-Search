import type { Metadata } from "next";
import { PlaygroundClient } from "./PlaygroundClient";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Playground AI Coding Workspace | Xpersona",
  description: "A coding workspace like ChatGPT, Codex, and Claude Code. Generate, debug, and ship faster with Playground AI.",
  alternates: { canonical: `${baseUrl}/playground` },
  openGraph: {
    title: "Playground AI Coding Workspace | Xpersona",
    description: "A coding workspace like ChatGPT, Codex, and Claude Code. Generate, debug, and ship faster with Playground AI.",
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

