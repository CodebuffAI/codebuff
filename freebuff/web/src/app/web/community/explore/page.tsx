"use client";

import ExploreFeed from "@/vly/components/community/ExploreFeed";
import { CommunityShell } from "@/vly/components/community/CommunityShell";

export default function ExplorePage() {
  return (
    <CommunityShell title="Explore">
      <ExploreFeed />
    </CommunityShell>
  );
}
