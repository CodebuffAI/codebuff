"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  Gift,
  ArrowUpRight,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/vly/components/ui/avatar";
import { Skeleton } from "@/vly/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import ProjectCard from "./ProjectCard";
import { cn } from "@/vly/lib/utils";
import type {
  CommunityCreatorData,
  CommunityPostCardData,
} from "@/vly/lib/community-types";

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
      return "border-white/15 bg-white/[0.06]";
    case 3:
      return "border-amber-600/35 bg-amber-700/10";
    default:
      return "border-white/10 bg-white/[0.03]";
  }
};

type ReferralLeaderboardEntry = {
  userId: string;
  name: string;
  profileImage?: string;
  referrals: number;
  rank: number;
  communityUserId?: string;
  isPaidUser: boolean;
  communityBadgeTier: number;
  followersCount: number;
  postsCount: number;
  totalLikesReceived: number;
};

const formatCount = new Intl.NumberFormat("en-US");

export default function Leaderboard({
  initialTopProjects = [],
  initialTopCreators = [],
}: {
  initialTopProjects?: CommunityPostCardData[];
  initialTopCreators?: CommunityCreatorData[];
}) {
  const topProjectsQuery = useQuery(api.community.getTopProjects, {
    limit: 10,
  });
  const topCreatorsQuery = useQuery(api.community.getTopCreators, { limit: 10 });
  const [referralLeaders, setReferralLeaders] = useState<
    ReferralLeaderboardEntry[] | undefined
  >(undefined);
  const topProjects = topProjectsQuery ?? initialTopProjects;
  const topCreators = topCreatorsQuery ?? initialTopCreators;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/web/referrals/leaderboard?limit=10")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load referral leaderboard");
        return (await res.json()) as {
          leaderboard: ReferralLeaderboardEntry[];
        };
      })
      .then((data) => {
        if (!cancelled) setReferralLeaders(data.leaderboard);
      })
      .catch(() => {
        if (!cancelled) setReferralLeaders([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-full pb-20">
      {/* Header */}
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/web/community"
            className="mb-6 inline-flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Community
          </Link>

          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
              <Trophy className="h-6 w-6 text-forest-bright" />
            </div>
            <div>
              <h1 className="lp-hero-heading text-3xl font-normal tracking-tight text-white sm:text-4xl">
                Leaderboard
              </h1>
              <p className="mt-1 text-white/55">
                Top projects and creators in the Freebuff community
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="projects" className="w-full">
          <TabsList className="mb-8 inline-flex h-12 rounded-full border border-white/10 bg-white/[0.03] p-1">
            <TabsTrigger
              value="projects"
              className="gap-2 rounded-full px-6 text-white/55 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              <TrendingUp className="h-4 w-4" />
              Top Projects
            </TabsTrigger>
            <TabsTrigger
              value="creators"
              className="gap-2 rounded-full px-6 text-white/55 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              <Users className="h-4 w-4" />
              Top Creators
            </TabsTrigger>
            <TabsTrigger
              value="referrals"
              className="gap-2 rounded-full px-6 text-white/55 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              <Gift className="h-4 w-4" />
              Referrals
            </TabsTrigger>
          </TabsList>

          {/* Top Projects */}
          <TabsContent value="projects" className="mt-0">
            {topProjectsQuery === undefined && initialTopProjects.length === 0 ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-80 rounded-lg bg-white/[0.05]" />
                ))}
              </div>
            ) : topProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-20 text-center">
                <h3 className="mb-2 text-xl font-medium text-white">
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
                    {topProjects.slice(3).map((post, index) => {
                      const rank = post.rank ?? index + 4;
                      return (
                        <Link
                          key={post._id}
                          href={`/web/community/project/${post._id}`}
                          className={cn(
                            "group flex items-center gap-4 rounded-lg border p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]",
                            getRankStyle(rank),
                          )}
                        >
                          {/* Rank */}
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.05] font-mono text-lg font-bold text-white/55">
                            {rank}
                          </div>

                          {/* Thumbnail */}
                          <div className="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-white/[0.05]">
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
                            <h4 className="truncate font-medium text-white group-hover:text-forest-bright">
                              {post.title}
                            </h4>
                            <div className="text-sm text-muted-foreground">
                              by {post.userName}
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
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Top Creators */}
          <TabsContent value="creators" className="mt-0">
            {topCreatorsQuery === undefined && initialTopCreators.length === 0 ? (
              <div className="space-y-4">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg bg-white/[0.05]" />
                ))}
              </div>
            ) : topCreators.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-20 text-center">
                <h3 className="mb-2 text-xl font-medium text-white">
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
                      "group flex items-center gap-4 rounded-lg border p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]",
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
                        <AvatarFallback className="bg-white/[0.06] text-lg font-bold text-forest-bright">
                          {creator.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-medium text-white group-hover:text-forest-bright">
                        {creator.name}
                      </h4>
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
                      <div className="flex items-center gap-2 text-lg font-semibold text-white">
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

          <TabsContent value="referrals" className="mt-0">
            {referralLeaders === undefined ? (
              <div className="space-y-4">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg bg-white/[0.05]" />
                ))}
              </div>
            ) : referralLeaders.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-20 text-center">
                <h3 className="mb-2 text-xl font-medium text-white">
                  No referral leaders yet
                </h3>
                <p className="text-muted-foreground">
                  Qualified Freebuff Web referrers will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {referralLeaders.map((leader) => {
                  const row = (
                    <>
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center">
                        {getRankIcon(leader.rank) || (
                          <span className="font-mono text-xl font-bold text-gray-400">
                            #{leader.rank}
                          </span>
                        )}
                      </div>

                      <Avatar
                        className={cn(
                          "h-14 w-14",
                          leader.rank === 1 && "ring-2 ring-amber-400",
                          leader.rank === 2 && "ring-2 ring-gray-400",
                          leader.rank === 3 && "ring-2 ring-amber-600",
                        )}
                      >
                        <AvatarImage src={leader.profileImage} />
                        <AvatarFallback className="bg-white/[0.06] text-lg font-bold text-forest-bright">
                          {leader.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <h4 className="truncate font-medium text-white group-hover:text-forest-bright">
                          {leader.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {formatCount.format(leader.followersCount)} followers
                          </span>
                          <span className="flex items-center gap-1">
                            <Folder className="h-3.5 w-3.5" />
                            {formatCount.format(leader.postsCount)} projects
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="h-3.5 w-3.5" />
                            {formatCount.format(leader.totalLikesReceived)} likes
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-2 text-lg font-semibold text-white">
                          <Gift className="h-5 w-5 text-forest-bright" />
                          {formatCount.format(leader.referrals)}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          referrals
                        </span>
                      </div>
                      {leader.communityUserId && (
                        <ArrowUpRight className="h-4 w-4 text-white/45 transition-colors group-hover:text-forest-bright" />
                      )}
                    </>
                  );

                  if (leader.communityUserId) {
                    return (
                      <Link
                        key={leader.userId}
                        href={`/web/community/profile/${leader.communityUserId}`}
                        className={cn(
                          "group flex items-center gap-4 rounded-lg border p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]",
                          getRankStyle(leader.rank),
                        )}
                      >
                        {row}
                      </Link>
                    );
                  }

                  return (
                    <div
                      key={leader.userId}
                      className={cn(
                        "group flex items-center gap-4 rounded-lg border p-4",
                        getRankStyle(leader.rank),
                      )}
                    >
                      {row}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
