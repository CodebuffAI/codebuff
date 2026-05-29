import CommunityHome from "@/vly/components/community/CommunityHome";
import { CommunityShell } from "@/vly/components/community/CommunityShell";
import { createPageMetadata } from "@/vly/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Community | Freebuff Web",
  description:
    "Explore projects, builders, and community work created with Freebuff Web.",
  path: "/web/community",
});

export default function CommunityPage() {
  return (
    <CommunityShell>
      <CommunityHome />
    </CommunityShell>
  );
}
