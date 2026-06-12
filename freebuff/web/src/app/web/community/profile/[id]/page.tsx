import UserProfile from "@/vly/components/community/UserProfile";
import { CommunityShell } from "@/vly/components/community/CommunityShell";
import { Id } from "@/convex/_generated/dataModel";
import { getCommunityProfileSeoData } from "@/server/community-seo";
import { createPageMetadata, SITE_URL } from "@/vly/lib/site-metadata";

import type { Metadata } from "next";

type UserProfilePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: UserProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  const { profile } = await getCommunityProfileSeoData(id as Id<"users">);

  if (!profile) {
    return createPageMetadata({
      title: "Community Profile | Freebuff Web",
      description: "View a Freebuff Web community creator profile.",
      path: `/web/community/profile/${id}`,
      noIndex: true,
    });
  }

  return createPageMetadata({
    title: `${profile.name} | Freebuff Community`,
    description:
      profile.bio ||
      `View ${profile.name}'s public Freebuff Web community projects.`,
    path: `/web/community/profile/${profile._id}`,
    imagePath: profile.profileImage,
  });
}

export default async function UserProfilePage({
  params,
}: UserProfilePageProps) {
  const { id } = await params;
  const userId = id as Id<"users">;
  const { profile, posts } = await getCommunityProfileSeoData(userId);
  const profileJsonLd = profile
    ? {
        "@context": "https://schema.org",
        "@type": "Person",
        name: profile.name,
        description:
          profile.bio ||
          `Freebuff Web community creator with ${profile.postsCount} public projects.`,
        url: `${SITE_URL}/web/community/profile/${profile._id}`,
        image: profile.profileImage,
        sameAs: [
          profile.website,
          profile.github ? `https://github.com/${profile.github}` : undefined,
          profile.twitter
            ? `https://twitter.com/${profile.twitter.replace("@", "")}`
            : undefined,
        ].filter(Boolean),
      }
    : null;

  return (
    <CommunityShell title="Profile">
      {profileJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }}
        />
      )}
      <UserProfile
        userId={userId}
        initialProfile={profile}
        initialPosts={posts}
      />
    </CommunityShell>
  );
}
