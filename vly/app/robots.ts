import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/app-support",
          "/callback",
          "/dashboard/",
          "/devtools",
          "/earn/admin/",
          "/github/",
          "/invite/",
          "/maintenance",
          "/migrating",
          "/project/",
          "/referrals",
          "/sso-callback",
          "/test",
          "/community/profile/",
          "/community/project/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
