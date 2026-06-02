"use client";

import { useParams } from "next/navigation";
import UserProfile from "@/vly/components/community/UserProfile";
import { CommunityShell } from "@/vly/components/community/CommunityShell";
import { Id } from "@/convex/_generated/dataModel";

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.id as Id<"users">;

  return (
    <CommunityShell title="Profile">
      <UserProfile userId={userId} />
    </CommunityShell>
  );
}
