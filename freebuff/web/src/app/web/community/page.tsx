import CommunityHome from "@/vly/components/community/CommunityHome";
import { CommunityShell } from "@/vly/components/community/CommunityShell";
import { getCommunityHomeSeoData } from "@/server/community-seo";
import { createPageMetadata, SITE_URL } from "@/vly/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Community | Freebuff Web",
  description:
    "Explore projects, builders, and community work created with Freebuff Web.",
  path: "/web/community",
});

export default async function CommunityPage() {
  const { featuredPosts, trendingPosts, topCreators } =
    await getCommunityHomeSeoData();
  const projects = [...featuredPosts, ...trendingPosts];
  const uniqueProjects = Array.from(
    new Map(projects.map((project) => [project._id, project])).values(),
  );
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Freebuff community projects",
    url: `${SITE_URL}/web/community`,
    itemListElement: uniqueProjects.map((project, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/web/community/project/${project._id}`,
      name: project.title,
    })),
  };

  return (
    <CommunityShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <CommunityHome
        initialFeaturedPosts={featuredPosts}
        initialTrendingPosts={trendingPosts}
        initialTopCreators={topCreators}
      />
    </CommunityShell>
  );
}
