import type { Metadata } from "next";
import { PlaygroundClient } from "./PlaygroundClient";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Playground | Plan, patch, and ship with one coding agent",
  description:
    "Playground turns coding requests into plans, repo-aware patches, and reviewable execution inside VS Code.",
  alternates: { canonical: `${baseUrl}/playground` },
  openGraph: {
    title: "Playground | Plan, patch, and ship with one coding agent",
    description:
      "Playground turns coding requests into plans, repo-aware patches, and reviewable execution inside VS Code.",
    url: `${baseUrl}/playground`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function PlaygroundPage() {
  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <main className="flex-1">
        <PlaygroundClient />
      </main>
    </div>
  );
}
