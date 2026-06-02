"use client";

import { useParams } from "next/navigation";
import ProjectDetail from "@/vly/components/community/ProjectDetail";
import { CommunityShell } from "@/vly/components/community/CommunityShell";
import { Id } from "@/convex/_generated/dataModel";

export default function ProjectDetailPage() {
  const params = useParams();
  const postId = params.id as Id<"community_posts">;

  return (
    <CommunityShell title="Project">
      <ProjectDetail postId={postId} />
    </CommunityShell>
  );
}
