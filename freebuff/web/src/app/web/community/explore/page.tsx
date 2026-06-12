import ExploreFeed from "@/vly/components/community/ExploreFeed";
import { CommunityShell } from "@/vly/components/community/CommunityShell";
import { getCommunityExploreSeoData } from "@/server/community-seo";
import { createPageMetadata, SITE_URL } from "@/vly/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Explore Community Projects | Freebuff Web",
  description:
    "Explore public apps and community projects built with Freebuff Web.",
  path: "/web/community/explore",
});

type ExplorePageProps = {
  searchParams?: Promise<{ q?: string | string[] }>;
};

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const params = await searchParams;
  const rawQuery = params?.q;
  const searchQuery = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
  const { posts } = await getCommunityExploreSeoData(searchQuery);
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Freebuff community project explorer",
    url: `${SITE_URL}/web/community/explore`,
    itemListElement: posts.map((project, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/web/community/project/${project._id}`,
      name: project.title,
    })),
  };

  return (
    <CommunityShell title="Explore">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <ExploreFeed initialPosts={posts} initialSearchQuery={searchQuery} />
    </CommunityShell>
  );
}
