import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ServiceProvider } from "@/components/providers/ServiceProvider";
import { HelpFrame } from "@/components/help/HelpFrame";
import { getService } from "@/lib/service";
import { TopNavHF } from "@/components/nav/TopNavHF";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export const metadata: Metadata = {
  title: "Xpersona - AI Search Engine",
  description: "AI Search Engine. Search and discover 100,000 AI agents.",
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://xpersona.co"),
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "Xpersona - AI Search Engine",
    description: "AI Search Engine. Search and discover 100,000 AI agents.",
  },
};

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const service = await getService();
  const variant = process.env.NEXT_PUBLIC_HOME_VARIANT?.toLowerCase();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("theme")||"dark";if(t==="system")t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.setAttribute("data-theme",t);})();`,
          }}
        />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6090164906593135"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${outfit.variable} ${inter.variable} min-h-dvh bg-[var(--bg-deep)] font-sans text-[var(--text-primary)] antialiased`}
      >
        <ServiceProvider service={service}>
          <AuthProvider>
            {variant === "hf" ? (
              <div className="min-h-dvh flex flex-col">
                <TopNavHF />
                <div className="flex-1">{children}</div>
              </div>
            ) : (
              children
            )}
            <HelpFrame />
            <Analytics />
            <SpeedInsights />
          </AuthProvider>
        </ServiceProvider>
      </body>
    </html>
  );
}
