import { cache } from 'react'
import { fetchQuery } from 'convex/nextjs'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type {
  CommunityCommentData,
  CommunityCreatorData,
  CommunityPostCardData,
  CommunityPostDetailData,
  CommunityProfileData,
  CommunitySitemapData,
} from '@/vly/lib/community-types'

async function safeFetch<T>(fetcher: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetcher()
  } catch (error) {
    console.warn('[community-seo] Failed to fetch community data', error)
    return fallback
  }
}

export const getCommunityHomeSeoData = cache(async () => {
  const [featuredPosts, trendingPosts, topCreators] = await Promise.all([
    safeFetch(
      () =>
        fetchQuery(api.community.getFeaturedPosts, {
          limit: 4,
        }) as Promise<CommunityPostCardData[]>,
      [],
    ),
    safeFetch(
      () =>
        fetchQuery(api.community.getTrendingPosts, {
          limit: 6,
        }) as Promise<CommunityPostCardData[]>,
      [],
    ),
    safeFetch(
      () =>
        fetchQuery(api.community.getTopCreators, {
          limit: 5,
        }) as Promise<CommunityCreatorData[]>,
      [],
    ),
  ])

  return { featuredPosts, trendingPosts, topCreators }
})

export const getCommunityExploreSeoData = cache(
  async (searchQuery?: string) => {
    if (searchQuery?.trim()) {
      const posts = await safeFetch(
        () =>
          fetchQuery(api.community.searchPosts, {
            searchQuery: searchQuery.trim(),
            limit: 30,
          }) as Promise<CommunityPostCardData[]>,
        [],
      )
      return { posts }
    }

    const exploreData = await safeFetch(
      () =>
        fetchQuery(api.community.getExplorePosts, {
          limit: 30,
        }) as Promise<{ posts: CommunityPostCardData[] }>,
      { posts: [] },
    )
    return { posts: exploreData.posts }
  },
)

export const getCommunityLeaderboardSeoData = cache(async () => {
  const [topProjects, topCreators] = await Promise.all([
    safeFetch(
      () =>
        fetchQuery(api.community.getTopProjects, {
          limit: 10,
        }).then((posts) =>
          (posts as Array<Omit<CommunityPostCardData, 'hasLiked'>>).map(
            (post) => ({
              ...post,
              hasLiked: false,
            }),
          ),
        ),
      [],
    ),
    safeFetch(
      () =>
        fetchQuery(api.community.getTopCreators, {
          limit: 10,
        }) as Promise<CommunityCreatorData[]>,
      [],
    ),
  ])

  return { topProjects, topCreators }
})

export const getCommunityProjectSeoData = cache(
  async (postId: Id<'community_posts'>) => {
    const [post, relatedPosts, comments] = await Promise.all([
      safeFetch(
        () =>
          fetchQuery(api.community.getPost, {
            postId,
          }) as Promise<CommunityPostDetailData | null>,
        null,
      ),
      safeFetch(
        () =>
          fetchQuery(api.community.getRelatedPosts, {
            postId,
            limit: 8,
          }) as Promise<CommunityPostCardData[]>,
        [],
      ),
      safeFetch(
        () =>
          fetchQuery(api.community.getComments, {
            postId,
          }) as Promise<CommunityCommentData[]>,
        [],
      ),
    ])

    return { post, relatedPosts, comments }
  },
)

export const getCommunityProfileSeoData = cache(
  async (userId: Id<'users'>) => {
    const [profile, posts] = await Promise.all([
      safeFetch(
        () =>
          fetchQuery(api.community.getUserProfile, {
            userId,
          }) as Promise<CommunityProfileData | null>,
        null,
      ),
      safeFetch(
        () =>
          fetchQuery(api.community.getUserPosts, {
            userId,
            limit: 20,
          }) as Promise<CommunityPostCardData[]>,
        [],
      ),
    ])

    return { profile, posts }
  },
)

export const getCommunitySitemapData = cache(async () =>
  safeFetch(
    () =>
      fetchQuery(api.community.getPublicPostsForSitemap, {
        limit: 500,
      }) as Promise<CommunitySitemapData>,
    { posts: [], users: [] },
  ),
)
