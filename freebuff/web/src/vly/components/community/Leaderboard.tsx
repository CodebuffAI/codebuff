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
  Folder,
  ArrowLeft,
  TrendingUp,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/vly/components/ui/avatar";
import { Badge } from "@/vly/components/ui/badge";
import { Skeleton } from "@/vly/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import ProjectCard from "./ProjectCard";
import { cn } from "@/vly/lib/utils";
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
      return "border-amber-400/35 bg-amber-500/10";
    case 2:
      return "border-border/70 bg-muted/25";
    case 3:
      return "border-amber-600/35 bg-amber-700/10";
    default:
      return "border-border/50 bg-muted/15";
  }
};

export default function Leaderboard() {
  const topProjects = useQuery(api.community.getTopProjects, { limit: 10 });
  const topCreators = useQuery(api.community.getTopCreators, { limit: 10 });

  return (
    <div className="min-h-full pb-20">
      {/* Header */}
      <div className="border-b border-border/50 bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/web/community"
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Community
          </Link>

          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border/60 bg-muted/25">
              <Trophy className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Leaderboard
              </h1>
              <p className="mt-1 text-muted-foreground">
                Top projects and creators in the Freebuff community
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="projects" className="w-full">
          <TabsList className="mb-8 inline-flex h-12 rounded-lg border border-border/60 bg-muted/20 p-1">
            <TabsTrigger
              value="projects"
              className="gap-2 rounded-md px-6 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-primary"
            >
              <TrendingUp className="h-4 w-4" />
              Top Projects
            </TabsTrigger>
            <TabsTrigger
              value="creators"
              className="gap-2 rounded-md px-6 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-primary"
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
                  <Skeleton key={i} className="h-80 rounded-lg bg-muted/35" />
                ))}
              </div>
            ) : topProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border/50 bg-muted/15 py-20 text-center">
                <h3 className="mb-2 text-xl font-medium text-foreground">
                  No projects yet
                </h3>
                <p className="text-muted-foreground">
                  Publish a deployed project to make it visible here.
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
                        href={`/web/community/project/${post._id}`}
                        className={cn(
                          "group flex items-center gap-4 rounded-lg border p-4 transition-colors hover:border-primary/35 hover:bg-muted/30",
                          getRankStyle(post.rank),
                        )}
                      >
                        {/* Rank */}
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/55 font-mono text-lg font-bold text-muted-foreground">
                          {post.rank}
                        </div>

                        {/* Thumbnail */}
                        <div className="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted/45">
                          {post.screenshotUrl ? (
                            <img
                              src={post.screenshotUrl}
                              alt={post.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              No preview
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate font-medium text-foreground group-hover:text-primary">
                            {post.title}
                          </h4>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                                className="h-4 border-border/60 bg-background/55 px-1 py-0 text-[10px] text-primary"
                              >
                                PRO
                              </Badge>
                            ) : null}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
                  <Skeleton key={i} className="h-20 rounded-lg bg-muted/35" />
                ))}
              </div>
            ) : topCreators.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border/50 bg-muted/15 py-20 text-center">
                <h3 className="mb-2 text-xl font-medium text-foreground">
                  No creators yet
                </h3>
                <p className="text-muted-foreground">
                  Creators appear here after publishing community projects.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {topCreators.map((creator) => (
                  <Link
                    key={creator._id}
                    href={`/web/community/profile/${creator._id}`}
                    className={cn(
                      "group flex items-center gap-4 rounded-lg border p-4 transition-colors hover:border-primary/35 hover:bg-muted/30",
                      getRankStyle(creator.rank),
                    )}
                  >
                    {/* Rank */}
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center">
                      {getRankIcon(creator.rank) || (
                        <span className="font-mono text-xl font-bold text-gray-400">
                          #
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
                        <AvatarFallback className="bg-background text-lg font-bold text-primary">
                          {creator.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate font-medium text-foreground group-hover:text-primary">
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
                          <Badge className="border border-border/60 bg-background/55 px-1.5 py-0 text-[10px] text-primary">
                            PRO
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Folder className="h-3.5 w-3.5" />
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
                      <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                        <Heart className="h-5 w-5 fill-rose-500 text-rose-500" />
                        {creator.totalLikesReceived}
                      </div>
                      <span className="text-xs text-muted-foreground">total likes</span>
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
