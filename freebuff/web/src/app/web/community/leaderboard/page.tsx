import Leaderboard from "@/vly/components/community/Leaderboard";
import { CommunityShell } from "@/vly/components/community/CommunityShell";
import { getCommunityLeaderboardSeoData } from "@/server/community-seo";
import { createPageMetadata, SITE_URL } from "@/vly/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Community Leaderboard | Freebuff Web",
  description:
    "See top Freebuff Web community projects and creators ranked by likes.",
  path: "/web/community/leaderboard",
});

export default async function LeaderboardPage() {
  const { topProjects, topCreators } = await getCommunityLeaderboardSeoData();
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Top Freebuff community projects",
    url: `${SITE_URL}/web/community/leaderboard`,
    itemListElement: topProjects.map((project, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/web/community/project/${project._id}`,
      name: project.title,
    })),
  };

  return (
    <CommunityShell title="Leaderboard">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <Leaderboard
        initialTopProjects={topProjects}
        initialTopCreators={topCreators}
      />
    </CommunityShell>
  );
}
