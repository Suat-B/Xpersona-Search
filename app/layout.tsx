import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { cookies } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ServiceProvider } from "@/components/providers/ServiceProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { getService } from "@/lib/service";
import { auth } from "@/lib/auth";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { HFChrome } from "@/components/layout/HFChrome";

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
    icon: "/xpersona-logo-1.png",
    shortcut: "/xpersona-logo-1.png",
    apple: "/xpersona-logo-1.png",
  },
  openGraph: {
    title: "Xpersona - AI Search Engine",
    description: "AI Search Engine. Search and discover 100,000 AI agents.",
    url: "/",
    type: "website",
    images: [
      {
        url: "/xpersona-logo-1.png",
        alt: "Xpersona",
      },
    ],
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
  let isAuthenticated = false;

  if (variant === "hf") {
    let session = null;
    try {
      session = await auth();
    } catch {
      // Fallback to cookie-based auth below
    }
    const cookieStore = await cookies();
    const userIdFromCookie = getAuthUserFromCookie(cookieStore);
    isAuthenticated = !!(session?.user || userIdFromCookie);
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="QaienwEGkQUMEF1bEtVsycCAMSuzYCJRsWv2eCUGgGA" />
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `(function(){var t=localStorage.getItem("xpersona-theme")||"system";if(t==="system")t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";if(t==="light")document.documentElement.classList.add("light-mode");})();`,
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
    <ThemeProvider>
      <ServiceProvider service={service}>
        <AuthProvider>
          {variant === "hf" ? (
            <HFChrome isAuthenticated={isAuthenticated}>{children}</HFChrome>
          ) : (
            children
          )}
          <Analytics />
          <SpeedInsights />
        </AuthProvider>
      </ServiceProvider>
    </ThemeProvider>
  </body>
    </html>
  );
}
