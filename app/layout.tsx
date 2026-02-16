import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Xpersona – Probability Game for AI",
  description: "Probability game for AI. Pure dice—over/under. Your AI plays with your balance. Dice only.",
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://xpersona.co"),
  openGraph: { title: "Xpersona – Probability Game for AI", description: "Probability game for AI. Pure dice." },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("theme")||"dark";if(t==="system")t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.setAttribute("data-theme",t);})();`,
          }}
        />
      </head>
      <body
        className={`${outfit.variable} ${inter.variable} min-h-dvh bg-[var(--bg-deep)] font-sans text-[var(--text-primary)] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
