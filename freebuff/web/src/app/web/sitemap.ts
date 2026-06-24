import type { MetadataRoute } from "next";
import { getCommunitySitemapData } from "@/server/community-seo";
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
  { path: "/web/about", changeFrequency: "weekly", priority: 0.9 },
  { path: "/web/community", changeFrequency: "daily", priority: 0.8 },
  { path: "/web/community/explore", changeFrequency: "daily", priority: 0.7 },
  {
    path: "/web/community/leaderboard",
    changeFrequency: "daily",
    priority: 0.65,
  },
  { path: "/web/contact", changeFrequency: "monthly", priority: 0.6 },
  { path: "/web/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/web/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const communityData = await getCommunitySitemapData();
  const staticEntries: MetadataRoute.Sitemap = publicRoutes.map(
    ({ path, changeFrequency, priority }) => ({
      url: new URL(path, SITE_URL).toString(),
      changeFrequency,
      priority,
    }),
  );

  const projectEntries: MetadataRoute.Sitemap = communityData.posts.map(
    (post) => ({
      url: new URL(`/web/community/project/${post._id}`, SITE_URL).toString(),
      lastModified: new Date(post.updatedAt).toISOString(),
      changeFrequency: "weekly",
      priority: 0.55,
    }),
  );

  const profileEntries: MetadataRoute.Sitemap = communityData.users.map(
    (user) => ({
      url: new URL(`/web/community/profile/${user._id}`, SITE_URL).toString(),
      lastModified: new Date(user.updatedAt).toISOString(),
      changeFrequency: "weekly",
      priority: 0.45,
    }),
  );

  return [...staticEntries, ...projectEntries, ...profileEntries];
}
