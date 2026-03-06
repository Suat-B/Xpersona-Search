import type { Metadata } from "next";
import { PlaygroundClient } from "./PlaygroundClient";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Playground AI for VS Code | Agentic coding workspace",
  description:
    "Plan, generate, and debug with full project context—then execute changes with policy-checked control. Powered by Playground 1, our in-house coding model.",
  alternates: { canonical: `${baseUrl}/playground` },
  openGraph: {
    title: "Playground AI for VS Code | Agentic coding workspace",
    description:
      "Plan, generate, and debug with full project context—then execute changes with policy-checked control. Powered by Playground 1, our in-house coding model.",
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

