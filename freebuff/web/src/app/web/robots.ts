import type { MetadataRoute } from "next";
import { SITE_URL } from "@/vly/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/web/admin/",
          "/app-support",
          "/callback",
          "/web/dashboard/",
          "/web/devtools",
          "/web/earn/admin/",
          "/github/",
          "/web/invite/",
          "/maintenance",
          "/migrating",
          "/web/project/",
          "/web/referrals",
          "/sso-callback",
          "/test",
          "/web/community/profile/",
          "/web/community/project/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
