import CommunityHome from "@/vly/components/community/CommunityHome";
import { PageLayout } from "@/vly/components/test-landing/PageLayout";
import { createPageMetadata } from "@/vly/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Community | vly.ai",
  description:
    "Explore projects, builders, and community work created with vly.ai.",
  path: "/web/community",
});

export default function CommunityPage() {
  return (
    <PageLayout showHome={true} showParallax={false}>
      <CommunityHome />
    </PageLayout>
  );
}
