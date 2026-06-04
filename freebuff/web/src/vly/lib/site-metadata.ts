import type { Metadata } from "next";

export const SITE_URL = "https://freebuff.com";
export const SITE_NAME = "Freebuff Web";
export const SITE_DISPLAY_NAME = "Freebuff Web";
export const DEFAULT_TITLE =
  "Freebuff Web | AI App Builder for Production-Ready Web Apps";
export const DEFAULT_DESCRIPTION =
  "Build production-ready web apps with Freebuff: AI coding agents, a managed backend, realtime data, and integrations — all in your browser.";
export const HOME_TITLE =
  "Freebuff Web | Build production-ready web apps with AI";
export const HOME_DESCRIPTION =
  "Freebuff Web ships full-stack web apps with AI coding agents, a managed backend, realtime data, and 1000+ integrations.";
export const DEFAULT_OG_IMAGE_PATH = "/freebuff-icon.svg";
export const BRAND_LOGO_URL = `${SITE_URL}/logo-icon.png`;
export const BRAND_ICON_URL = `${SITE_URL}/freebuff-icon.svg`;

type PageMetadataOptions = {
  title: string;
  description?: string;
  path?: string;
  imagePath?: string;
  noIndex?: boolean;
};

export function createPageMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  imagePath = DEFAULT_OG_IMAGE_PATH,
  noIndex = false,
}: PageMetadataOptions): Metadata {
  const canonicalUrl = new URL(path, SITE_URL).toString();
  const imageUrl = new URL(imagePath, SITE_URL).toString();

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
      creator: "@freebuffdev",
    },
    robots: noIndex
      ? {
          index: false,
          follow: true,
        }
      : {
          index: true,
          follow: true,
        },
  };
}

export const brandStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      alternateName: SITE_DISPLAY_NAME,
      url: SITE_URL,
      email: "team@freebuff.com",
      logo: {
        "@type": "ImageObject",
        url: BRAND_LOGO_URL,
        width: 512,
        height: 512,
      },
      image: {
        "@type": "ImageObject",
        url: BRAND_ICON_URL,
        width: 512,
        height: 512,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      alternateName: SITE_DISPLAY_NAME,
      inLanguage: "en-US",
      publisher: {
        "@id": `${SITE_URL}/#organization`,
      },
    },
  ],
} as const;
