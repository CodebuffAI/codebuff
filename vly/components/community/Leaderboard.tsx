"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Trophy,
  Crown,
  Medal,
  Heart,
  Users,
  Rocket,
  ArrowLeft,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectCard from "./ProjectCard";
import { cn } from "@/lib/utils";
import { CommunityBadge } from "./CommunityBadge";

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Crown className="h-5 w-5 text-amber-500" />;
    case 2:
      return <Medal className="h-5 w-5 text-gray-400" />;
    case 3:
      return <Medal className="h-5 w-5 text-amber-600" />;
    default:
      return null;
  }
};

const getRankStyle = (rank: number) => {
  switch (rank) {
    case 1:
      return "border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50";
    case 2:
      return "border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50";
    case 3:
      return "border-amber-200 bg-gradient-to-r from-amber-50/50 to-orange-50/50";
    default:
      return "border-gray-100 bg-white";
  }
};

export default function Leaderboard() {
  const topProjects = useQuery(api.community.getTopProjects, { limit: 10 });
  const topCreators = useQuery(api.community.getTopCreators, { limit: 10 });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-20">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-gray-100">
        <div className="absolute inset-0">
          <div className="absolute left-1/4 top-0 h-[400px] w-[400px] rounded-full bg-amber-100/50 blur-[100px]" />
          <div className="absolute right-1/4 top-0 h-[300px] w-[300px] rounded-full bg-violet-100/50 blur-[80px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Link
            href="/community"
            className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Community
          </Link>

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-100">
              <Trophy className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                Leaderboard
              </h1>
              <p className="mt-1 text-gray-500">
                Top projects and creators in the Vly community
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="projects" className="w-full">
          <TabsList className="mb-8 inline-flex h-12 rounded-xl border border-gray-200 bg-gray-50 p-1">
            <TabsTrigger
              value="projects"
              className="gap-2 rounded-lg px-6 text-gray-600 data-[state=active]:bg-white data-[state=active]:text-violet-600 data-[state=active]:shadow-sm"
            >
              <TrendingUp className="h-4 w-4" />
              Top Projects
            </TabsTrigger>
            <TabsTrigger
              value="creators"
              className="gap-2 rounded-lg px-6 text-gray-600 data-[state=active]:bg-white data-[state=active]:text-violet-600 data-[state=active]:shadow-sm"
            >
              <Users className="h-4 w-4" />
              Top Creators
            </TabsTrigger>
          </TabsList>

          {/* Top Projects */}
          <TabsContent value="projects" className="mt-0">
            {topProjects === undefined ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-80 rounded-2xl bg-gray-100" />
                ))}
              </div>
            ) : topProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-20 text-center shadow-sm">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-50">
                  <Rocket className="h-10 w-10 text-violet-500" />
                </div>
                <h3 className="mb-2 text-xl font-medium text-gray-900">
                  No projects yet
                </h3>
                <p className="text-gray-500">
                  Be the first to publish a project!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Top 3 podium */}
                <div className="mb-8 grid gap-4 lg:grid-cols-3">
                  {topProjects.slice(0, 3).map((post) => (
                    <ProjectCard
                      key={post._id}
                      post={{
                        ...post,
                        featured: post.rank === 1,
                        hasLiked: false,
                      }}
                      showRank={post.rank}
                      variant={post.rank === 1 ? "featured" : "default"}
                    />
                  ))}
                </div>

                {/* Rest of leaderboard */}
                {topProjects.length > 3 && (
                  <div className="space-y-3">
                    {topProjects.slice(3).map((post) => (
                      <Link
                        key={post._id}
                        href={`/community/project/${post._id}`}
                        className={cn(
                          "group flex items-center gap-4 rounded-xl border p-4 shadow-sm transition-all hover:border-violet-200 hover:shadow-md",
                          getRankStyle(post.rank),
                        )}
                      >
                        {/* Rank */}
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 font-mono text-lg font-bold text-gray-500">
                          {post.rank}
                        </div>

                        {/* Thumbnail */}
                        <div className="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                          {post.screenshotUrl ? (
                            <img
                              src={post.screenshotUrl}
                              alt={post.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-50 to-fuchsia-50 text-xl">
                              🚀
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate font-medium text-gray-900 group-hover:text-violet-600">
                            {post.title}
                          </h4>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>by {post.userName}</span>
                            {(post as any).communityBadgeTier &&
                            (post as any).communityBadgeTier > 0 ? (
                              <CommunityBadge
                                communityBadgeTier={
                                  (post as any).communityBadgeTier
                                }
                                size="sm"
                              />
                            ) : post.isPaidUser ? (
                              <Badge
                                variant="outline"
                                className="h-4 border-violet-200 bg-violet-50 px-1 py-0 text-[10px] text-violet-600"
                              >
                                PRO
                              </Badge>
                            ) : null}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Heart className="h-4 w-4" />
                            <span>{post.likesCount}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Top Creators */}
          <TabsContent value="creators" className="mt-0">
            {topCreators === undefined ? (
              <div className="space-y-4">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : topCreators.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-20 text-center shadow-sm">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-50">
                  <Users className="h-10 w-10 text-violet-500" />
                </div>
                <h3 className="mb-2 text-xl font-medium text-gray-900">
                  No creators yet
                </h3>
                <p className="text-gray-500">
                  Be the first to join the community!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {topCreators.map((creator) => (
                  <Link
                    key={creator._id}
                    href={`/community/profile/${creator._id}`}
                    className={cn(
                      "group flex items-center gap-4 rounded-xl border p-4 shadow-sm transition-all hover:border-violet-200 hover:shadow-md",
                      getRankStyle(creator.rank),
                    )}
                  >
                    {/* Rank */}
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center">
                      {getRankIcon(creator.rank) || (
                        <span className="font-mono text-xl font-bold text-gray-400">
                          {creator.rank}
                        </span>
                      )}
                    </div>

                    {/* Avatar */}
                    <div className="relative">
                      <Avatar
                        className={cn(
                          "h-14 w-14",
                          creator.rank === 1 && "ring-2 ring-amber-400",
                          creator.rank === 2 && "ring-2 ring-gray-400",
                          creator.rank === 3 && "ring-2 ring-amber-600",
                        )}
                      >
                        <AvatarImage src={creator.profileImage} />
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg font-bold text-white">
                          {creator.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {creator.isPaidUser && (
                        <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 ring-2 ring-white">
                          <Sparkles className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate font-medium text-gray-900 group-hover:text-violet-600">
                          {creator.name}
                        </h4>
                        {(creator as any).communityBadgeTier &&
                        (creator as any).communityBadgeTier > 0 ? (
                          <CommunityBadge
                            communityBadgeTier={
                              (creator as any).communityBadgeTier
                            }
                            size="sm"
                          />
                        ) : creator.isPaidUser ? (
                          <Badge className="border-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 px-1.5 py-0 text-[10px] text-white">
                            PRO
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Rocket className="h-3.5 w-3.5" />
                          {creator.postsCount} projects
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {creator.followersCount} followers
                        </span>
                      </div>
                    </div>

                    {/* Total likes */}
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                        <Heart className="h-5 w-5 fill-rose-500 text-rose-500" />
                        {creator.totalLikesReceived}
                      </div>
                      <span className="text-xs text-gray-500">total likes</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
