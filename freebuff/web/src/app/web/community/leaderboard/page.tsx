"use client";

import Leaderboard from "@/vly/components/community/Leaderboard";
import { CommunityShell } from "@/vly/components/community/CommunityShell";

export default function LeaderboardPage() {
  return (
    <CommunityShell title="Leaderboard">
      <Leaderboard />
    </CommunityShell>
  );
}
