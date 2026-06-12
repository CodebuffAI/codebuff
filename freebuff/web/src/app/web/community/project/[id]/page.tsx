import ProjectDetail from "@/vly/components/community/ProjectDetail";
import { CommunityShell } from "@/vly/components/community/CommunityShell";
import { Id } from "@/convex/_generated/dataModel";
import { getCommunityProjectSeoData } from "@/server/community-seo";
import { createPageMetadata, SITE_URL } from "@/vly/lib/site-metadata";

import type { Metadata } from "next";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: ProjectDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const { post } = await getCommunityProjectSeoData(
    id as Id<"community_posts">,
  );

  if (!post) {
    return createPageMetadata({
      title: "Community Project | Freebuff Web",
      description: "View a public Freebuff Web community project.",
      path: `/web/community/project/${id}`,
      noIndex: true,
    });
  }

  return createPageMetadata({
    title: `${post.title} | Freebuff Community`,
    description:
      post.description ||
      `A Freebuff Web community project published by ${post.userName}.`,
    path: `/web/community/project/${post._id}`,
    imagePath: post.screenshotUrl,
  });
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params;
  const postId = id as Id<"community_posts">;
  const { post, comments, relatedPosts } =
    await getCommunityProjectSeoData(postId);
  const projectJsonLd = post
    ? {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: post.title,
        description:
          post.description ||
          `A Freebuff Web community project published by ${post.userName}.`,
        url: `${SITE_URL}/web/community/project/${post._id}`,
        image: post.screenshotUrl,
        author: {
          "@type": "Person",
          name: post.userName,
          url: `${SITE_URL}/web/community/profile/${post.userId}`,
        },
        applicationCategory: "WebApplication",
        interactionStatistic: [
          {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/LikeAction",
            userInteractionCount: post.likesCount,
          },
          {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/ViewAction",
            userInteractionCount: post.viewsCount,
          },
        ],
      }
    : null;

  return (
    <CommunityShell title="Project">
      {projectJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(projectJsonLd) }}
        />
      )}
      <ProjectDetail
        postId={postId}
        initialPost={post}
        initialComments={comments}
        initialRelatedPosts={relatedPosts}
      />
    </CommunityShell>
  );
}
