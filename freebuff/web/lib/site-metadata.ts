import type { Metadata } from "next";

export const SITE_URL = "https://vly.ai";
export const SITE_NAME = "vly.ai";
export const SITE_DISPLAY_NAME = "VLY AI";
export const DEFAULT_TITLE =
  "vly.ai | AI App Builder for Production-Ready Web Apps";
export const DEFAULT_DESCRIPTION =
  "Build production-ready web apps with AI, a managed backend, realtime data, integrations, and coding agents.";
export const HOME_TITLE = "vly.ai | We Just Killed Bolt, Replit & Base44";
export const HOME_DESCRIPTION =
  "We just killed Bolt, Replit, and Base44. vly.ai is 7x cheaper and better for AI with a custom realtime architecture, backend visualizations, 1000+ integrations, and advanced coding agents.";
export const DEFAULT_OG_IMAGE_PATH = "/landing/landmarks.jpeg";
export const BRAND_LOGO_URL = `${SITE_URL}/logos/falcon_clear_bg.png`;
export const BRAND_ICON_URL = `${SITE_URL}/logos/falcon_logo_favicon.png`;

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
      creator: "@vlyai",
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
      email: "james@mail.freebuff.app",
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
