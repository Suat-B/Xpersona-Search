import type { Metadata } from "next";
import { PlaygroundClient } from "./PlaygroundClient";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Playground | Xpersona",
  description: "Playground plans and free trial options for Xpersona.",
  alternates: { canonical: `${baseUrl}/playground` },
  openGraph: {
    title: "Playground | Xpersona",
    description: "Playground plans and free trial options for Xpersona.",
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
