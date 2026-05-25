import CommunityHome from "@/components/community/CommunityHome";
import { PageLayout } from "@/components/test-landing/PageLayout";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Community | vly.ai",
  description:
    "Explore projects, builders, and community work created with vly.ai.",
  path: "/community",
});

export default function CommunityPage() {
  return (
    <PageLayout showHome={true} showParallax={false}>
      <CommunityHome />
    </PageLayout>
  );
}
