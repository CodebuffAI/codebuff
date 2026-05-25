import { PostHogProvider, ReactQueryProvider } from "@/app/providers";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { AutumnWrapper } from "@/components/AutumnWrapper";
import { PosthogIdentificationProvider } from "@/components/posthog-identification-provider";
import { ReactScanProvider } from "@/components/ReactScanProvider";
import { ConditionalAdminPanel } from "@/components/providers/ConditionalAdminPanel";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider } from "@clerk/nextjs";
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  SITE_DISPLAY_NAME,
  SITE_URL,
  brandStructuredData,
  createPageMetadata,
} from "@/lib/site-metadata";

import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const perfectlyNineties = localFont({
  src: [
    {
      path: "../public/PerfectlyNineties-Regular.woff2",
      style: "normal",
    },
    {
      path: "../public/PerfectlyNineties-Italic.woff2",
      style: "italic",
    },
  ],
  variable: "--font-perfectly-nineties",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_DISPLAY_NAME,
  ...createPageMetadata({
    title:
      process.env.NEXT_PUBLIC_NODE_ENV === "dev" ? "vly.ai (dev)" : HOME_TITLE,
    description: HOME_DESCRIPTION,
    path: "/",
  }),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      {
        url: "/manifest/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/manifest/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
    ],
    shortcut: ["/favicon.ico"],
    apple: [
      {
        url: "/manifest/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  other: {
    "msapplication-TileColor": "#ffffff",
    "msapplication-TileImage": "/manifest/android-chrome-192x192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="no-scrollbar" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
        <Script
          id="brand-structured-data"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(brandStructuredData),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} ${perfectlyNineties.variable} overflow-y-scroll font-sans antialiased`}
        suppressHydrationWarning
        style={{
          backgroundColor: "#CBCFDA",
        }}
      >
        <PostHogProvider>
          <ClerkProvider dynamic appearance={{}}>
            <ConvexClientProvider>
              <ReactQueryProvider>
                <AutumnWrapper>
                  <TooltipProvider>
                    <PosthogIdentificationProvider>
                      <ThemeProvider
                        attribute="class"
                        defaultTheme="light"
                        enableSystem={false}
                        disableTransitionOnChange
                      >
                        {process.env.NODE_ENV === "development" && (
                          <ReactScanProvider />
                        )}
                        {children}
                        <ConditionalAdminPanel />
                        <Toaster position="top-right" richColors />
                      </ThemeProvider>
                    </PosthogIdentificationProvider>
                  </TooltipProvider>
                </AutumnWrapper>
              </ReactQueryProvider>
            </ConvexClientProvider>
          </ClerkProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
