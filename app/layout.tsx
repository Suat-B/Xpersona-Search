import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ServiceProvider } from "@/components/providers/ServiceProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { getService } from "@/lib/service";
import { auth } from "@/lib/auth";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { HFChrome } from "@/components/layout/HFChrome";
import { BotAdBanner } from "@/components/ads/BotAdBanner";
import { serializeSponsoredJsonLd } from "@/lib/ads/structured-ad";
import { shouldLoadPublisherTagScript } from "@/lib/ads/gam-config";
import { getAdSenseClientId, shouldLoadAdSenseForRequest } from "@/lib/ads/adsense-config";

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
  const ga4Id = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim();
  const headerStore = await headers();
  const isBot = headerStore.get("x-is-bot") === "1";
  const botPath = headerStore.get("x-bot-path") || "/";
  const adsenseClientId = getAdSenseClientId();
  const shouldLoadGoogleAdScripts = shouldLoadAdSenseForRequest();
  const loadGpt = shouldLoadGoogleAdScripts && shouldLoadPublisherTagScript();
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
        <meta name="google-adsense-account" content={adsenseClientId} />
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `(function(){var t=localStorage.getItem("xpersona-theme");if(t===null||t==="")t="light";var eff=t;if(t==="system")eff=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(eff==="light")document.documentElement.classList.add("light-mode");else document.documentElement.classList.remove("light-mode");})();`,
        }}
      />
        {shouldLoadGoogleAdScripts ? (
          <>
            <Script
              id="adsense-js"
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClientId}`}
              strategy="beforeInteractive"
              crossOrigin="anonymous"
            />
            {loadGpt ? (
              <Script
                src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"
                strategy="afterInteractive"
                id="gpt-js"
              />
            ) : null}
          </>
        ) : null}
        {ga4Id ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} strategy="afterInteractive" />
            <Script id="ga4-config" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');`}
            </Script>
          </>
        ) : null}
        {isBot ? (
          <script
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: serializeSponsoredJsonLd(),
            }}
          />
        ) : null}
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
          <BotAdBanner className="mx-auto max-w-6xl px-4 pb-6" />
          {isBot ? (
            // Tracking pixel (must stay a plain <img>; Next/Image is inappropriate here)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/v1/beacon?dedupe=mw&p=${encodeURIComponent(botPath)}`}
              width={1}
              height={1}
              alt=""
              className="pointer-events-none absolute h-px w-px opacity-0"
              fetchPriority="low"
            />
          ) : null}
          <Analytics />
          <SpeedInsights />
        </AuthProvider>
      </ServiceProvider>
    </ThemeProvider>
  </body>
    </html>
  );
}
