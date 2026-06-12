import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { signedInUser } from "!/users";

// Helper function to get the screenshot URL for a post
// Prefers fresh URL from storage ID, falls back to stored URL
async function getPostScreenshotUrl(
  ctx: QueryCtx,
  post: {
    screenshotStorageId?: Id<"_storage">;
    screenshotUrl?: string;
  },
): Promise<string | undefined> {
  // If we have a storage ID, generate a fresh URL
  if (post.screenshotStorageId) {
    const freshUrl = await ctx.storage.getUrl(post.screenshotStorageId);
    if (freshUrl) {
      return freshUrl;
    }
  }
  // Fall back to stored URL
  return post.screenshotUrl;
}

// ============================================
// POSTS
// ============================================

// Public community URLs for sitemap generation.
export const getPublicPostsForSitemap = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    posts: v.array(
      v.object({
        _id: v.id("community_posts"),
        userId: v.id("users"),
        updatedAt: v.number(),
      }),
    ),
    users: v.array(
      v.object({
        _id: v.id("users"),
        updatedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit || 500;
    const posts = await ctx.db
      .query("community_posts")
      .withIndex("by_published_at")
      .order("desc")
      .take(limit * 2);

    const publicPosts = posts
      .filter((post) => post.isPublic !== false)
      .slice(0, limit);

    const usersById = new Map<Id<"users">, number>();
    for (const post of publicPosts) {
      const timestamp = post.updatedAt ?? post.publishedAt;
      usersById.set(
        post.userId,
        Math.max(usersById.get(post.userId) ?? 0, timestamp),
      );
    }

    return {
      posts: publicPosts.map((post) => ({
        _id: post._id,
        userId: post.userId,
        updatedAt: post.updatedAt ?? post.publishedAt,
      })),
      users: Array.from(usersById.entries()).map(([userId, updatedAt]) => ({
        _id: userId,
        updatedAt,
      })),
    };
  },
});

// Publish a project to the community
export const publishProject = mutation({
  args: {
    projectId: v.id("project"),
    title: v.string(),
    description: v.string(),
    tags: v.array(v.string()),
  },
  returns: v.id("community_posts"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    let user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      const userId = await signedInUser(ctx);
      user = await ctx.db.get(userId);
    }

    if (!user) {
      throw new Error("User not found");
    }

    // Get project info
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Require deployment before publishing to community
    if (!project.prod_deployment_slug) {
      throw new Error(
        "Project must be deployed before publishing to community",
      );
    }

    // Use the deployed URL (not the dev URL)
    const deployedUrl = `https://${project.prod_deployment_slug}.freebuff.app`;

    // Get screenshot URL if available (screenshot_r2_url is already a public URL)
    let screenshotUrl: string | undefined;
    if (project.screenshot_r2_url) {
      screenshotUrl = project.screenshot_r2_url;
    }

    // Check if already published
    const existingPost = await ctx.db
      .query("community_posts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();

    if (existingPost) {
      // Update existing post with the current deployed URL and screenshot
      await ctx.db.patch(existingPost._id, {
        title: args.title,
        description: args.description,
        tags: args.tags,
        previewUrl: deployedUrl,
        screenshotUrl,
        updatedAt: Date.now(),
      });
      return existingPost._id;
    }

    // Create new post
    const postId = await ctx.db.insert("community_posts", {
      projectId: args.projectId,
      userId: user._id,
      title: args.title,
      description: args.description,
      tags: args.tags,
      previewUrl: deployedUrl,
      screenshotUrl,
      likesCount: 0,
      commentsCount: 0,
      viewsCount: 0,
      isPublic: true, // Public by default
      publishedAt: Date.now(),
    });

    // Update user's posts count
    const profile = await ctx.db
      .query("community_profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (profile) {
      await ctx.db.patch(profile._id, {
        postsCount: profile.postsCount + 1,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("community_profiles", {
        userId: user._id,
        followersCount: 0,
        followingCount: 0,
        postsCount: 1,
        totalLikesReceived: 0,
        updatedAt: Date.now(),
      });
    }

    return postId;
  },
});

// Get featured posts for the explore page
export const getFeaturedPosts = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("community_posts"),
      projectId: v.id("project"),
      userId: v.id("users"),
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      screenshotUrl: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
      likesCount: v.number(),
      commentsCount: v.number(),
      viewsCount: v.number(),
      featured: v.optional(v.boolean()),
      publishedAt: v.number(),
      userName: v.string(),
      userImage: v.optional(v.string()),
      isPaidUser: v.boolean(),
      communityBadgeTier: v.number(),
      hasLiked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    const posts = await ctx.db
      .query("community_posts")
      .withIndex("by_featured")
      .order("desc")
      .take(limit * 2); // Fetch more to account for filtered private posts

    // Filter out private posts
    const publicPosts = posts
      .filter((p) => p.isPublic !== false)
      .slice(0, limit);

    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();
    }

    const enrichedPosts = await Promise.all(
      publicPosts.map(async (post) => {
        const user = await ctx.db.get(post.userId);
        let hasLiked = false;

        if (currentUser) {
          const like = await ctx.db
            .query("community_likes")
            .withIndex("by_post_and_user", (q) =>
              q.eq("postId", post._id).eq("userId", currentUser._id),
            )
            .unique();
          hasLiked = !!like;
        }

        const screenshotUrl = await getPostScreenshotUrl(ctx, post);

        return {
          _id: post._id,
          projectId: post.projectId,
          userId: post.userId,
          title: post.title,
          description: post.description,
          tags: post.tags,
          screenshotUrl,
          previewUrl: post.previewUrl,
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          viewsCount: post.viewsCount,
          featured: post.featured,
          publishedAt: post.publishedAt,
          userName: user?.name || "Anonymous",
          userImage: user?.profile_image,
          isPaidUser: user?.tier === "pro",
          communityBadgeTier: user?.community_badge_tier ?? 0,
          hasLiked,
        };
      }),
    );

    // Sort by community badge tier (higher first), then by likes
    enrichedPosts.sort((a, b) => {
      if (b.communityBadgeTier !== a.communityBadgeTier) {
        return b.communityBadgeTier - a.communityBadgeTier;
      }
      return b.likesCount - a.likesCount;
    });

    return enrichedPosts;
  },
});

// Get explore feed (recent posts)
export const getExplorePosts = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  returns: v.object({
    posts: v.array(
      v.object({
        _id: v.id("community_posts"),
        projectId: v.id("project"),
        userId: v.id("users"),
        title: v.string(),
        description: v.string(),
        tags: v.array(v.string()),
        screenshotUrl: v.optional(v.string()),
        previewUrl: v.optional(v.string()),
        likesCount: v.number(),
        commentsCount: v.number(),
        viewsCount: v.number(),
        featured: v.optional(v.boolean()),
        publishedAt: v.number(),
        userName: v.string(),
        userImage: v.optional(v.string()),
        isPaidUser: v.boolean(),
        communityBadgeTier: v.number(),
        hasLiked: v.boolean(),
      }),
    ),
    nextCursor: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    let postsQuery = ctx.db
      .query("community_posts")
      .withIndex("by_published_at")
      .order("desc");

    if (args.cursor) {
      postsQuery = postsQuery.filter((q) =>
        q.lt(q.field("publishedAt"), args.cursor!),
      );
    }

    const posts = await postsQuery.take((limit + 1) * 2); // Fetch more to account for private posts

    // Filter out private posts
    const publicPosts = posts.filter((p) => p.isPublic !== false);
    const hasMore = publicPosts.length > limit;
    const postsToReturn = hasMore ? publicPosts.slice(0, limit) : publicPosts;

    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();
    }

    const enrichedPosts = await Promise.all(
      postsToReturn.map(async (post) => {
        const user = await ctx.db.get(post.userId);
        let hasLiked = false;

        if (currentUser) {
          const like = await ctx.db
            .query("community_likes")
            .withIndex("by_post_and_user", (q) =>
              q.eq("postId", post._id).eq("userId", currentUser._id),
            )
            .unique();
          hasLiked = !!like;
        }

        const screenshotUrl = await getPostScreenshotUrl(ctx, post);

        return {
          _id: post._id,
          projectId: post.projectId,
          userId: post.userId,
          title: post.title,
          description: post.description,
          tags: post.tags,
          screenshotUrl,
          previewUrl: post.previewUrl,
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          viewsCount: post.viewsCount,
          featured: post.featured,
          publishedAt: post.publishedAt,
          userName: user?.name || "Anonymous",
          userImage: user?.profile_image,
          isPaidUser: user?.tier === "pro",
          communityBadgeTier: user?.community_badge_tier ?? 0,
          hasLiked,
        };
      }),
    );

    // Sort by community badge tier (higher first), then by publishedAt
    enrichedPosts.sort((a, b) => {
      if (b.communityBadgeTier !== a.communityBadgeTier) {
        return b.communityBadgeTier - a.communityBadgeTier;
      }
      return b.publishedAt - a.publishedAt;
    });

    return {
      posts: enrichedPosts,
      nextCursor: hasMore
        ? postsToReturn[postsToReturn.length - 1].publishedAt
        : null,
    };
  },
});

// Get trending posts (by likes)
export const getTrendingPosts = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("community_posts"),
      projectId: v.id("project"),
      userId: v.id("users"),
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      screenshotUrl: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
      likesCount: v.number(),
      commentsCount: v.number(),
      viewsCount: v.number(),
      featured: v.optional(v.boolean()),
      publishedAt: v.number(),
      userName: v.string(),
      userImage: v.optional(v.string()),
      isPaidUser: v.boolean(),
      communityBadgeTier: v.number(),
      hasLiked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    const posts = await ctx.db
      .query("community_posts")
      .withIndex("by_likes_count")
      .order("desc")
      .take(limit * 2); // Fetch more to account for private posts

    // Filter out private posts
    const publicPosts = posts
      .filter((p) => p.isPublic !== false)
      .slice(0, limit);

    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();
    }

    const enrichedPosts = await Promise.all(
      publicPosts.map(async (post) => {
        const user = await ctx.db.get(post.userId);
        let hasLiked = false;

        if (currentUser) {
          const like = await ctx.db
            .query("community_likes")
            .withIndex("by_post_and_user", (q) =>
              q.eq("postId", post._id).eq("userId", currentUser._id),
            )
            .unique();
          hasLiked = !!like;
        }

        const screenshotUrl = await getPostScreenshotUrl(ctx, post);

        return {
          _id: post._id,
          projectId: post.projectId,
          userId: post.userId,
          title: post.title,
          description: post.description,
          tags: post.tags,
          screenshotUrl,
          previewUrl: post.previewUrl,
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          viewsCount: post.viewsCount,
          featured: post.featured,
          publishedAt: post.publishedAt,
          userName: user?.name || "Anonymous",
          userImage: user?.profile_image,
          isPaidUser: user?.tier === "pro",
          communityBadgeTier: user?.community_badge_tier ?? 0,
          hasLiked,
        };
      }),
    );

    // Sort by community badge tier (higher first), then by likes
    enrichedPosts.sort((a, b) => {
      if (b.communityBadgeTier !== a.communityBadgeTier) {
        return b.communityBadgeTier - a.communityBadgeTier;
      }
      return b.likesCount - a.likesCount;
    });

    return enrichedPosts;
  },
});

// Get a single post with details
export const getPost = query({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.union(
    v.object({
      _id: v.id("community_posts"),
      projectId: v.id("project"),
      userId: v.id("users"),
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      screenshotUrl: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
      likesCount: v.number(),
      commentsCount: v.number(),
      viewsCount: v.number(),
      featured: v.optional(v.boolean()),
      isPublic: v.boolean(),
      publishedAt: v.number(),
      userName: v.string(),
      userImage: v.optional(v.string()),
      isPaidUser: v.boolean(),
      communityBadgeTier: v.number(),
      hasLiked: v.boolean(),
      isOwner: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;

    const user = await ctx.db.get(post.userId);
    const identity = await ctx.auth.getUserIdentity();

    let currentUser = null;
    let hasLiked = false;
    let isOwner = false;

    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();

      if (currentUser) {
        isOwner = currentUser._id === post.userId;
        const like = await ctx.db
          .query("community_likes")
          .withIndex("by_post_and_user", (q) =>
            q.eq("postId", post._id).eq("userId", currentUser!._id),
          )
          .unique();
        hasLiked = !!like;
      }
    }

    // Private posts are only visible to their owner
    if (post.isPublic === false && !isOwner) {
      return null;
    }

    // Get the screenshot URL (fresh from storage ID if available)
    const screenshotUrl = await getPostScreenshotUrl(ctx, post);

    return {
      _id: post._id,
      projectId: post.projectId,
      userId: post.userId,
      title: post.title,
      description: post.description,
      tags: post.tags,
      screenshotUrl,
      previewUrl: post.previewUrl,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      viewsCount: post.viewsCount,
      featured: post.featured,
      isPublic: post.isPublic !== false, // defaults to true if undefined
      publishedAt: post.publishedAt,
      userName: user?.name || "Anonymous",
      userImage: user?.profile_image,
      isPaidUser: user?.tier === "pro",
      communityBadgeTier: user?.community_badge_tier ?? 0,
      hasLiked,
      isOwner,
    };
  },
});

// Search posts
export const searchPosts = query({
  args: {
    searchQuery: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("community_posts"),
      projectId: v.id("project"),
      userId: v.id("users"),
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      screenshotUrl: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
      likesCount: v.number(),
      commentsCount: v.number(),
      viewsCount: v.number(),
      featured: v.optional(v.boolean()),
      publishedAt: v.number(),
      userName: v.string(),
      userImage: v.optional(v.string()),
      isPaidUser: v.boolean(),
      communityBadgeTier: v.number(),
      hasLiked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    const posts = await ctx.db
      .query("community_posts")
      .withSearchIndex("search_posts", (q) =>
        q.search("title", args.searchQuery),
      )
      .take(limit);

    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();
    }

    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        const user = await ctx.db.get(post.userId);
        let hasLiked = false;

        if (currentUser) {
          const like = await ctx.db
            .query("community_likes")
            .withIndex("by_post_and_user", (q) =>
              q.eq("postId", post._id).eq("userId", currentUser._id),
            )
            .unique();
          hasLiked = !!like;
        }

        const screenshotUrl = await getPostScreenshotUrl(ctx, post);

        return {
          _id: post._id,
          projectId: post.projectId,
          userId: post.userId,
          title: post.title,
          description: post.description,
          tags: post.tags,
          screenshotUrl,
          previewUrl: post.previewUrl,
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          viewsCount: post.viewsCount,
          featured: post.featured,
          publishedAt: post.publishedAt,
          userName: user?.name || "Anonymous",
          userImage: user?.profile_image,
          isPaidUser: user?.tier === "pro",
          communityBadgeTier: user?.community_badge_tier ?? 0,
          hasLiked,
        };
      }),
    );

    // Sort by community badge tier (higher first), then by likes
    enrichedPosts.sort((a, b) => {
      if (b.communityBadgeTier !== a.communityBadgeTier) {
        return b.communityBadgeTier - a.communityBadgeTier;
      }
      return b.likesCount - a.likesCount;
    });

    return enrichedPosts;
  },
});

// ============================================
// LIKES
// ============================================

// Like a post
export const likePost = mutation({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if already liked
    const existingLike = await ctx.db
      .query("community_likes")
      .withIndex("by_post_and_user", (q) =>
        q.eq("postId", args.postId).eq("userId", user._id),
      )
      .unique();

    if (existingLike) {
      return false;
    }

    // Add like
    await ctx.db.insert("community_likes", {
      postId: args.postId,
      userId: user._id,
      createdAt: Date.now(),
    });

    // Update post likes count
    const post = await ctx.db.get(args.postId);
    if (post) {
      await ctx.db.patch(args.postId, {
        likesCount: post.likesCount + 1,
      });

      // Update author's total likes received
      const authorProfile = await ctx.db
        .query("community_profiles")
        .withIndex("by_user", (q) => q.eq("userId", post.userId))
        .unique();

      if (authorProfile) {
        await ctx.db.patch(authorProfile._id, {
          totalLikesReceived: authorProfile.totalLikesReceived + 1,
          updatedAt: Date.now(),
        });
      }
    }

    return true;
  },
});

// Unlike a post
export const unlikePost = mutation({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Find existing like
    const existingLike = await ctx.db
      .query("community_likes")
      .withIndex("by_post_and_user", (q) =>
        q.eq("postId", args.postId).eq("userId", user._id),
      )
      .unique();

    if (!existingLike) {
      return false;
    }

    // Remove like
    await ctx.db.delete(existingLike._id);

    // Update post likes count
    const post = await ctx.db.get(args.postId);
    if (post) {
      await ctx.db.patch(args.postId, {
        likesCount: Math.max(0, post.likesCount - 1),
      });

      // Update author's total likes received
      const authorProfile = await ctx.db
        .query("community_profiles")
        .withIndex("by_user", (q) => q.eq("userId", post.userId))
        .unique();

      if (authorProfile) {
        await ctx.db.patch(authorProfile._id, {
          totalLikesReceived: Math.max(0, authorProfile.totalLikesReceived - 1),
          updatedAt: Date.now(),
        });
      }
    }

    return true;
  },
});

// ============================================
// COMMENTS
// ============================================

// Add a comment
export const addComment = mutation({
  args: {
    postId: v.id("community_posts"),
    content: v.string(),
    parentCommentId: v.optional(v.id("community_comments")),
  },
  returns: v.id("community_comments"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const commentId = await ctx.db.insert("community_comments", {
      postId: args.postId,
      userId: user._id,
      content: args.content,
      parentCommentId: args.parentCommentId,
      likesCount: 0,
      createdAt: Date.now(),
    });

    // Update post comments count
    const post = await ctx.db.get(args.postId);
    if (post) {
      await ctx.db.patch(args.postId, {
        commentsCount: post.commentsCount + 1,
      });
    }

    return commentId;
  },
});

// Get comments for a post
export const getComments = query({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.array(
    v.object({
      _id: v.id("community_comments"),
      postId: v.id("community_posts"),
      userId: v.id("users"),
      content: v.string(),
      parentCommentId: v.optional(v.id("community_comments")),
      likesCount: v.number(),
      createdAt: v.number(),
      userName: v.string(),
      userImage: v.optional(v.string()),
      isPaidUser: v.boolean(),
      hasLiked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("community_comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .order("asc")
      .collect();

    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();
    }

    const enrichedComments = await Promise.all(
      comments.map(async (comment) => {
        const user = await ctx.db.get(comment.userId);
        let hasLiked = false;

        if (currentUser) {
          const like = await ctx.db
            .query("community_comment_likes")
            .withIndex("by_comment_and_user", (q) =>
              q.eq("commentId", comment._id).eq("userId", currentUser._id),
            )
            .unique();
          hasLiked = !!like;
        }

        return {
          _id: comment._id,
          postId: comment.postId,
          userId: comment.userId,
          content: comment.content,
          parentCommentId: comment.parentCommentId,
          likesCount: comment.likesCount,
          createdAt: comment.createdAt,
          userName: user?.name || "Anonymous",
          userImage: user?.profile_image,
          isPaidUser: user?.tier === "pro",
          hasLiked,
        };
      }),
    );

    return enrichedComments;
  },
});

// Like a comment
export const likeComment = mutation({
  args: {
    commentId: v.id("community_comments"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const existingLike = await ctx.db
      .query("community_comment_likes")
      .withIndex("by_comment_and_user", (q) =>
        q.eq("commentId", args.commentId).eq("userId", user._id),
      )
      .unique();

    if (existingLike) {
      // Unlike
      await ctx.db.delete(existingLike._id);
      const comment = await ctx.db.get(args.commentId);
      if (comment) {
        await ctx.db.patch(args.commentId, {
          likesCount: Math.max(0, comment.likesCount - 1),
        });
      }
      return false;
    } else {
      // Like
      await ctx.db.insert("community_comment_likes", {
        commentId: args.commentId,
        userId: user._id,
        createdAt: Date.now(),
      });
      const comment = await ctx.db.get(args.commentId);
      if (comment) {
        await ctx.db.patch(args.commentId, {
          likesCount: comment.likesCount + 1,
        });
      }
      return true;
    }
  },
});

// ============================================
// FOLLOWS
// ============================================

// Follow a user
export const followUser = mutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    if (currentUser._id === args.userId) {
      throw new Error("Cannot follow yourself");
    }

    // Check if already following
    const existingFollow = await ctx.db
      .query("community_follows")
      .withIndex("by_follower_and_following", (q) =>
        q.eq("followerId", currentUser._id).eq("followingId", args.userId),
      )
      .unique();

    if (existingFollow) {
      return false;
    }

    // Create follow
    await ctx.db.insert("community_follows", {
      followerId: currentUser._id,
      followingId: args.userId,
      createdAt: Date.now(),
    });

    // Update follower's following count
    const followerProfile = await ctx.db
      .query("community_profiles")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .unique();

    if (followerProfile) {
      await ctx.db.patch(followerProfile._id, {
        followingCount: followerProfile.followingCount + 1,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("community_profiles", {
        userId: currentUser._id,
        followersCount: 0,
        followingCount: 1,
        postsCount: 0,
        totalLikesReceived: 0,
        updatedAt: Date.now(),
      });
    }

    // Update following user's followers count
    const followingProfile = await ctx.db
      .query("community_profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (followingProfile) {
      await ctx.db.patch(followingProfile._id, {
        followersCount: followingProfile.followersCount + 1,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("community_profiles", {
        userId: args.userId,
        followersCount: 1,
        followingCount: 0,
        postsCount: 0,
        totalLikesReceived: 0,
        updatedAt: Date.now(),
      });
    }

    return true;
  },
});

// Unfollow a user
export const unfollowUser = mutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    // Find existing follow
    const existingFollow = await ctx.db
      .query("community_follows")
      .withIndex("by_follower_and_following", (q) =>
        q.eq("followerId", currentUser._id).eq("followingId", args.userId),
      )
      .unique();

    if (!existingFollow) {
      return false;
    }

    // Remove follow
    await ctx.db.delete(existingFollow._id);

    // Update follower's following count
    const followerProfile = await ctx.db
      .query("community_profiles")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .unique();

    if (followerProfile) {
      await ctx.db.patch(followerProfile._id, {
        followingCount: Math.max(0, followerProfile.followingCount - 1),
        updatedAt: Date.now(),
      });
    }

    // Update following user's followers count
    const followingProfile = await ctx.db
      .query("community_profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (followingProfile) {
      await ctx.db.patch(followingProfile._id, {
        followersCount: Math.max(0, followingProfile.followersCount - 1),
        updatedAt: Date.now(),
      });
    }

    return true;
  },
});

// ============================================
// PROFILES
// ============================================

// Get current user's ID for profile navigation
export const getCurrentUserId = query({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    return user?._id ?? null;
  },
});

// Get user profile
export const getUserProfile = query({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      email: v.string(),
      profileImage: v.optional(v.string()),
      isPaidUser: v.boolean(),
      communityBadgeTier: v.number(),
      bio: v.optional(v.string()),
      website: v.optional(v.string()),
      twitter: v.optional(v.string()),
      github: v.optional(v.string()),
      followersCount: v.number(),
      followingCount: v.number(),
      postsCount: v.number(),
      totalLikesReceived: v.number(),
      isFollowing: v.boolean(),
      isOwnProfile: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const profile = await ctx.db
      .query("community_profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const identity = await ctx.auth.getUserIdentity();
    let isFollowing = false;
    let isOwnProfile = false;

    if (identity) {
      const currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();

      if (currentUser) {
        isOwnProfile = currentUser._id === args.userId;

        if (!isOwnProfile) {
          const follow = await ctx.db
            .query("community_follows")
            .withIndex("by_follower_and_following", (q) =>
              q
                .eq("followerId", currentUser._id)
                .eq("followingId", args.userId),
            )
            .unique();
          isFollowing = !!follow;
        }
      }
    }

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profile_image,
      isPaidUser: user.tier === "pro",
      communityBadgeTier: user.community_badge_tier ?? 0,
      bio: profile?.bio,
      website: profile?.website,
      twitter: profile?.twitter,
      github: profile?.github,
      followersCount: profile?.followersCount || 0,
      followingCount: profile?.followingCount || 0,
      postsCount: profile?.postsCount || 0,
      totalLikesReceived: profile?.totalLikesReceived || 0,
      isFollowing,
      isOwnProfile,
    };
  },
});

// Get user's posts
export const getUserPosts = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("community_posts"),
      projectId: v.id("project"),
      userId: v.id("users"),
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      screenshotUrl: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
      likesCount: v.number(),
      commentsCount: v.number(),
      viewsCount: v.number(),
      featured: v.optional(v.boolean()),
      isPublic: v.boolean(),
      publishedAt: v.number(),
      userName: v.string(),
      userImage: v.optional(v.string()),
      isPaidUser: v.boolean(),
      communityBadgeTier: v.number(),
      hasLiked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    const posts = await ctx.db
      .query("community_posts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);

    const user = await ctx.db.get(args.userId);

    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();
    }

    // Check if viewing own profile
    const isOwnProfile = currentUser?._id === args.userId;

    // Filter out private posts for non-owners
    const visiblePosts = isOwnProfile
      ? posts
      : posts.filter((p) => p.isPublic !== false);

    const enrichedPosts = await Promise.all(
      visiblePosts.map(async (post) => {
        let hasLiked = false;

        if (currentUser) {
          const like = await ctx.db
            .query("community_likes")
            .withIndex("by_post_and_user", (q) =>
              q.eq("postId", post._id).eq("userId", currentUser._id),
            )
            .unique();
          hasLiked = !!like;
        }

        const screenshotUrl = await getPostScreenshotUrl(ctx, post);

        return {
          _id: post._id,
          projectId: post.projectId,
          userId: post.userId,
          title: post.title,
          description: post.description,
          tags: post.tags,
          screenshotUrl,
          previewUrl: post.previewUrl,
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          viewsCount: post.viewsCount,
          featured: post.featured,
          isPublic: post.isPublic !== false, // defaults to true
          publishedAt: post.publishedAt,
          userName: user?.name || "Anonymous",
          userImage: user?.profile_image,
          isPaidUser: user?.tier === "pro",
          communityBadgeTier: user?.community_badge_tier ?? 0,
          hasLiked,
        };
      }),
    );

    return enrichedPosts;
  },
});

// Update profile
export const updateProfile = mutation({
  args: {
    bio: v.optional(v.string()),
    website: v.optional(v.string()),
    twitter: v.optional(v.string()),
    github: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const profile = await ctx.db
      .query("community_profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (profile) {
      await ctx.db.patch(profile._id, {
        bio: args.bio,
        website: args.website,
        twitter: args.twitter,
        github: args.github,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("community_profiles", {
        userId: user._id,
        bio: args.bio,
        website: args.website,
        twitter: args.twitter,
        github: args.github,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        totalLikesReceived: 0,
        updatedAt: Date.now(),
      });
    }

    return true;
  },
});

// ============================================
// LEADERBOARDS
// ============================================

// Get top creators (by total likes received)
export const getTopCreators = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      profileImage: v.optional(v.string()),
      isPaidUser: v.boolean(),
      communityBadgeTier: v.number(),
      followersCount: v.number(),
      postsCount: v.number(),
      totalLikesReceived: v.number(),
      rank: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    const profiles = await ctx.db
      .query("community_profiles")
      .withIndex("by_total_likes")
      .order("desc")
      .take(limit);

    const creators = await Promise.all(
      profiles.map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        return {
          _id: profile.userId,
          name: user?.name || "Anonymous",
          profileImage: user?.profile_image,
          isPaidUser: user?.tier === "pro",
          communityBadgeTier: user?.community_badge_tier ?? 0,
          followersCount: profile.followersCount,
          postsCount: profile.postsCount,
          totalLikesReceived: profile.totalLikesReceived,
          rank: 0, // Will be set after sorting
        };
      }),
    );

    // Sort by community badge tier (higher first), then by total likes
    creators.sort((a, b) => {
      if (b.communityBadgeTier !== a.communityBadgeTier) {
        return b.communityBadgeTier - a.communityBadgeTier;
      }
      return b.totalLikesReceived - a.totalLikesReceived;
    });

    // Assign ranks after sorting
    return creators.map((creator, index) => ({
      ...creator,
      rank: index + 1,
    }));
  },
});

// Get top projects (by likes)
export const getTopProjects = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("community_posts"),
      projectId: v.id("project"),
      userId: v.id("users"),
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      screenshotUrl: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
      likesCount: v.number(),
      commentsCount: v.number(),
      viewsCount: v.number(),
      publishedAt: v.number(),
      userName: v.string(),
      userImage: v.optional(v.string()),
      isPaidUser: v.boolean(),
      communityBadgeTier: v.number(),
      rank: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 10;

    const posts = await ctx.db
      .query("community_posts")
      .withIndex("by_likes_count")
      .order("desc")
      .take(limit);

    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        const user = await ctx.db.get(post.userId);
        const screenshotUrl = await getPostScreenshotUrl(ctx, post);

        return {
          _id: post._id,
          projectId: post.projectId,
          userId: post.userId,
          title: post.title,
          description: post.description,
          tags: post.tags,
          screenshotUrl,
          previewUrl: post.previewUrl,
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          viewsCount: post.viewsCount,
          publishedAt: post.publishedAt,
          userName: user?.name || "Anonymous",
          userImage: user?.profile_image,
          isPaidUser: user?.tier === "pro",
          communityBadgeTier: user?.community_badge_tier ?? 0,
          rank: 0, // Will be set after sorting
        };
      }),
    );

    // Sort by community badge tier (higher first), then by likes
    enrichedPosts.sort((a, b) => {
      if (b.communityBadgeTier !== a.communityBadgeTier) {
        return b.communityBadgeTier - a.communityBadgeTier;
      }
      return b.likesCount - a.likesCount;
    });

    // Assign ranks after sorting
    return enrichedPosts.map((post, index) => ({
      ...post,
      rank: index + 1,
    }));
  },
});

// ============================================
// VIEWS
// ============================================

// Record a view
export const recordView = mutation({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let userId = null;

    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();
      userId = user?._id;
    }

    // Only record view if user is logged in (to prevent spam)
    if (userId) {
      // Check if user already viewed recently (within last hour)
      const recentView = await ctx.db
        .query("community_views")
        .withIndex("by_post_and_viewer", (q) =>
          q.eq("postId", args.postId).eq("viewerUserId", userId),
        )
        .first();

      if (!recentView || Date.now() - recentView.viewedAt > 3600000) {
        await ctx.db.insert("community_views", {
          postId: args.postId,
          viewerUserId: userId,
          viewedAt: Date.now(),
        });

        // Update post views count
        const post = await ctx.db.get(args.postId);
        if (post) {
          await ctx.db.patch(args.postId, {
            viewsCount: post.viewsCount + 1,
          });
        }
      }
    }

    return null;
  },
});

// Get user's projects for publishing (shows deployment status)
export const getUnpublishedProjects = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("project"),
      name: v.optional(v.string()),
      semanticIdentifier: v.string(),
      previewUrl: v.optional(v.string()),
      deployedUrl: v.optional(v.string()),
      isPublished: v.boolean(),
      hasDeployment: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      return [];
    }

    // Get user's projects
    const projectMembers = await ctx.db
      .query("project_member")
      .withIndex("by_user", (q) => q.eq("user", user._id))
      .collect();

    const projects = await Promise.all(
      projectMembers.map(async (member) => {
        const project = await ctx.db.get(member.project);
        if (!project || project.deleted) return null;

        // Check if already published
        const existingPost = await ctx.db
          .query("community_posts")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .unique();

        // Use deployed URL if available, otherwise dev URL for preview
        const hasDeployment = !!project.prod_deployment_slug;
        const deployedUrl = hasDeployment
          ? `https://${project.prod_deployment_slug}.freebuff.app`
          : undefined;

        return {
          _id: project._id,
          name: project.name,
          semanticIdentifier: project.semantic_identifier,
          previewUrl: project.pretty_preview_url || project.preview_url,
          deployedUrl,
          isPublished: !!existingPost,
          hasDeployment,
        };
      }),
    );

    return projects.filter((p): p is NonNullable<typeof p> => p !== null);
  },
});

// Get community post by project ID
export const getPostByProject = query({
  args: {
    projectId: v.id("project"),
  },
  returns: v.union(
    v.object({
      _id: v.id("community_posts"),
      title: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const post = await ctx.db
      .query("community_posts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();

    if (!post) return null;

    return {
      _id: post._id,
      title: post.title,
    };
  },
});

// Delete a post - deletes post immediately, schedules cleanup for related data
export const deletePost = mutation({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    // Check ownership or admin
    if (
      post.userId !== user._id &&
      user.role !== "god" &&
      user.role !== "admin"
    ) {
      throw new Error("Not authorized to delete this post");
    }

    // Update user's profile first
    const profile = await ctx.db
      .query("community_profiles")
      .withIndex("by_user", (q) => q.eq("userId", post.userId))
      .unique();

    if (profile) {
      await ctx.db.patch(profile._id, {
        postsCount: Math.max(0, profile.postsCount - 1),
        totalLikesReceived: Math.max(
          0,
          profile.totalLikesReceived - post.likesCount,
        ),
        updatedAt: Date.now(),
      });
    }

    // Delete the post immediately
    await ctx.db.delete(args.postId);

    // Schedule background cleanup for related data (runs in separate transactions)
    await ctx.scheduler.runAfter(0, internal.community.cleanupPostLikes, {
      postId: args.postId,
    });
    await ctx.scheduler.runAfter(100, internal.community.cleanupPostComments, {
      postId: args.postId,
    });
    await ctx.scheduler.runAfter(200, internal.community.cleanupPostViews, {
      postId: args.postId,
    });

    return true;
  },
});

// Internal mutation to clean up post likes in batches
export const cleanupPostLikes = internalMutation({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const BATCH_SIZE = 200;

    const likes = await ctx.db
      .query("community_likes")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(BATCH_SIZE);

    for (const like of likes) {
      await ctx.db.delete(like._id);
    }

    // If there are more, schedule another cleanup
    if (likes.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(50, internal.community.cleanupPostLikes, {
        postId: args.postId,
      });
    }

    return null;
  },
});

// Internal mutation to clean up post comments in batches
export const cleanupPostComments = internalMutation({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const BATCH_SIZE = 50;

    const comments = await ctx.db
      .query("community_comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(BATCH_SIZE);

    for (const comment of comments) {
      // Delete comment likes first (small batch)
      const commentLikes = await ctx.db
        .query("community_comment_likes")
        .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
        .take(50);

      for (const commentLike of commentLikes) {
        await ctx.db.delete(commentLike._id);
      }

      await ctx.db.delete(comment._id);
    }

    // If there are more, schedule another cleanup
    if (comments.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(50, internal.community.cleanupPostComments, {
        postId: args.postId,
      });
    }

    return null;
  },
});

// Internal mutation to clean up post views in batches
export const cleanupPostViews = internalMutation({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const BATCH_SIZE = 500;

    const views = await ctx.db
      .query("community_views")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(BATCH_SIZE);

    for (const view of views) {
      await ctx.db.delete(view._id);
    }

    // If there are more, schedule another cleanup
    if (views.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(50, internal.community.cleanupPostViews, {
        postId: args.postId,
      });
    }

    return null;
  },
});

// Update a post (title, description, tags)
export const updatePost = mutation({
  args: {
    postId: v.id("community_posts"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    // Check ownership
    if (
      post.userId !== user._id &&
      user.role !== "god" &&
      user.role !== "admin"
    ) {
      throw new Error("Not authorized to edit this post");
    }

    // Update the post
    await ctx.db.patch(args.postId, {
      ...(args.title && { title: args.title }),
      ...(args.description && { description: args.description }),
      ...(args.tags && { tags: args.tags }),
      updatedAt: Date.now(),
    });

    return true;
  },
});

// Generate upload URL for community post screenshot
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

// Update post screenshot
export const updatePostScreenshot = mutation({
  args: {
    postId: v.id("community_posts"),
    storageId: v.id("_storage"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    console.log("[updatePostScreenshot] Starting with args:", {
      postId: args.postId,
      storageId: args.storageId,
    });

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    // Check ownership
    if (
      post.userId !== user._id &&
      user.role !== "god" &&
      user.role !== "admin"
    ) {
      throw new Error("Not authorized to edit this post");
    }

    // Get the URL for the uploaded file to verify it exists
    const screenshotUrl = await ctx.storage.getUrl(args.storageId);
    console.log("[updatePostScreenshot] Got screenshotUrl:", screenshotUrl);

    if (!screenshotUrl) {
      throw new Error("Failed to get screenshot URL");
    }

    // Store both the storage ID (for future URL generation) and the current URL
    await ctx.db.patch(args.postId, {
      screenshotStorageId: args.storageId,
      screenshotUrl,
      updatedAt: Date.now(),
    });

    console.log("[updatePostScreenshot] Successfully updated post screenshot");
    return true;
  },
});

// Make a post private (unlisted)
export const makePostPrivate = mutation({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    // Check ownership
    if (
      post.userId !== user._id &&
      user.role !== "god" &&
      user.role !== "admin"
    ) {
      throw new Error("Not authorized to modify this post");
    }

    // Make private
    await ctx.db.patch(args.postId, {
      isPublic: false,
      updatedAt: Date.now(),
    });

    return true;
  },
});

// Make a post public (relist)
export const makePostPublic = mutation({
  args: {
    postId: v.id("community_posts"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    // Check ownership
    if (
      post.userId !== user._id &&
      user.role !== "god" &&
      user.role !== "admin"
    ) {
      throw new Error("Not authorized to modify this post");
    }

    // Make public
    await ctx.db.patch(args.postId, {
      isPublic: true,
      updatedAt: Date.now(),
    });

    return true;
  },
});

// Get related/recommended posts
export const getRelatedPosts = query({
  args: {
    postId: v.id("community_posts"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("community_posts"),
      projectId: v.id("project"),
      userId: v.id("users"),
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
      screenshotUrl: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
      likesCount: v.number(),
      commentsCount: v.number(),
      viewsCount: v.number(),
      featured: v.optional(v.boolean()),
      publishedAt: v.number(),
      userName: v.string(),
      userImage: v.optional(v.string()),
      isPaidUser: v.boolean(),
      communityBadgeTier: v.number(),
      hasLiked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 6;

    // Get posts excluding the current one, ordered by likes
    const posts = await ctx.db
      .query("community_posts")
      .withIndex("by_likes_count")
      .order("desc")
      .take((limit + 1) * 2); // Fetch more to account for private posts

    // Filter out the current post and private posts
    const filteredPosts = posts
      .filter((p) => p._id !== args.postId && p.isPublic !== false)
      .slice(0, limit);

    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
        .unique();
    }

    const enrichedPosts = await Promise.all(
      filteredPosts.map(async (post) => {
        const user = await ctx.db.get(post.userId);
        let hasLiked = false;

        if (currentUser) {
          const like = await ctx.db
            .query("community_likes")
            .withIndex("by_post_and_user", (q) =>
              q.eq("postId", post._id).eq("userId", currentUser._id),
            )
            .unique();
          hasLiked = !!like;
        }

        const screenshotUrl = await getPostScreenshotUrl(ctx, post);

        return {
          _id: post._id,
          projectId: post.projectId,
          userId: post.userId,
          title: post.title,
          description: post.description,
          tags: post.tags,
          screenshotUrl,
          previewUrl: post.previewUrl,
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          viewsCount: post.viewsCount,
          featured: post.featured,
          publishedAt: post.publishedAt,
          userName: user?.name || "Anonymous",
          userImage: user?.profile_image,
          isPaidUser: user?.tier === "pro",
          communityBadgeTier: user?.community_badge_tier ?? 0,
          hasLiked,
        };
      }),
    );

    // Sort by community badge tier (higher first), then by likes
    enrichedPosts.sort((a, b) => {
      if (b.communityBadgeTier !== a.communityBadgeTier) {
        return b.communityBadgeTier - a.communityBadgeTier;
      }
      return b.likesCount - a.likesCount;
    });

    return enrichedPosts;
  },
});

// Update user's community badge tier (called from client when Autumn data changes)
export const updateCommunityBadgeTier = mutation({
  args: {
    communityBadgeTier: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Only update if the tier has changed
    if (user.community_badge_tier !== args.communityBadgeTier) {
      await ctx.db.patch(user._id, {
        community_badge_tier: args.communityBadgeTier,
      });
    }

    return true;
  },
});
