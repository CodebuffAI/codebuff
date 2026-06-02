import type { MetadataRoute } from "next";
import { SITE_URL } from "@/vly/lib/site-metadata";

const publicRoutes: Array<{
  path: string;
  changeFrequency:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority: number;
}> = [
  { path: "/web", changeFrequency: "daily", priority: 1 },
  { path: "/web/about", changeFrequency: "weekly", priority: 0.9 },
  { path: "/web/pricing", changeFrequency: "weekly", priority: 0.9 },
  { path: "/web/community", changeFrequency: "daily", priority: 0.8 },
  { path: "/web/contact", changeFrequency: "monthly", priority: 0.6 },
  { path: "/web/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/web/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map(({ path, changeFrequency, priority }) => ({
    url: new URL(path, SITE_URL).toString(),
    changeFrequency,
    priority,
  }));
}
