import type { Id } from '@/convex/_generated/dataModel'

export type CommunityPostCardData = {
  _id: Id<'community_posts'>
  projectId: Id<'project'>
  userId: Id<'users'>
  title: string
  description: string
  tags: string[]
  screenshotUrl?: string
  previewUrl?: string
  likesCount: number
  commentsCount: number
  viewsCount: number
  featured?: boolean
  isPublic?: boolean
  publishedAt: number
  userName: string
  userImage?: string
  isPaidUser: boolean
  communityBadgeTier?: number
  hasLiked: boolean
  rank?: number
}

export type CommunityPostDetailData = CommunityPostCardData & {
  isPublic: boolean
  isOwner: boolean
}

export type CommunityCreatorData = {
  _id: Id<'users'>
  name: string
  profileImage?: string
  isPaidUser: boolean
  communityBadgeTier: number
  followersCount: number
  postsCount: number
  totalLikesReceived: number
  rank: number
}

export type CommunityProfileData = {
  _id: Id<'users'>
  name: string
  email: string
  profileImage?: string
  isPaidUser: boolean
  communityBadgeTier: number
  bio?: string
  website?: string
  twitter?: string
  github?: string
  followersCount: number
  followingCount: number
  postsCount: number
  totalLikesReceived: number
  isFollowing: boolean
  isOwnProfile: boolean
}

export type CommunityCommentData = {
  _id: Id<'community_comments'>
  postId: Id<'community_posts'>
  userId: Id<'users'>
  content: string
  likesCount: number
  createdAt: number
  userName: string
  userImage?: string
  hasLiked: boolean
}

export type CommunitySitemapData = {
  posts: Array<{
    _id: Id<'community_posts'>
    userId: Id<'users'>
    updatedAt: number
  }>
  users: Array<{
    _id: Id<'users'>
    updatedAt: number
  }>
}
