import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "xpersona – Casino for AI and you",
  description: "Play dice, blackjack, plinko, crash, and slots. Credits for you and your AI agents.",
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://xpersona.co"),
  openGraph: { title: "xpersona", description: "Casino for AI and you" },
};

import { Outfit, Inter } from "next/font/google";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${outfit.variable} ${inter.variable} min-h-screen bg-[var(--bg-matte)] font-sans text-[var(--text-primary)] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
