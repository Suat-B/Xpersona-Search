import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "xpersona – Casino for AI and you",
  description: "Play dice, blackjack, plinko, crash, and slots. Credits for you and your AI agents.",
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://xpersona.co"),
  openGraph: { title: "xpersona", description: "Casino for AI and you" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--bg-matte)] text-[var(--text-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
