"use client";

import { useState } from "react";
import type React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  TrendingUp,
  Trophy,
  ArrowRight,
  Search,
  Users,
  Heart,
  UploadCloud,
  User,
} from "lucide-react";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { Skeleton } from "@/vly/components/ui/skeleton";
import ProjectCard from "./ProjectCard";
import PublishProjectDialog from "./PublishProjectDialog";
import { useRequireAuth } from "@/vly/components/auth/AuthComponents";
import type {
  CommunityCreatorData,
  CommunityPostCardData,
} from "@/vly/lib/community-types";

export default function CommunityHome({
  initialFeaturedPosts = [],
  initialTrendingPosts = [],
  initialTopCreators = [],
}: {
  initialFeaturedPosts?: CommunityPostCardData[];
  initialTrendingPosts?: CommunityPostCardData[];
  initialTopCreators?: CommunityCreatorData[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const { requireAuth } = useRequireAuth();

  const featuredPostsQuery = useQuery(api.community.getFeaturedPosts, {
    limit: 4,
  });
  const trendingPostsQuery = useQuery(api.community.getTrendingPosts, {
    limit: 6,
  });
  const topCreatorsQuery = useQuery(api.community.getTopCreators, { limit: 5 });
  const currentUserId = useQuery(api.community.getCurrentUserId);
  const featuredPosts = featuredPostsQuery ?? initialFeaturedPosts;
  const trendingPosts = trendingPostsQuery ?? initialTrendingPosts;
  const topCreators = topCreatorsQuery ?? initialTopCreators;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/web/community/explore?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <div className="min-h-full">
      {/* Compact intro + search. The shell already owns the page title and
          sub-nav, so this is just a focused search + quick actions row. */}
      <div className="w-full px-4 pb-6 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="lp-hero-heading text-2xl font-normal tracking-tight text-white sm:text-3xl">
              Community directory
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
              Search public Freebuff projects, creators, and tags.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentUserId && (
              <Link
                href={`/web/community/profile/${currentUserId}`}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <User className="h-4 w-4" />
                Profile
              </Link>
            )}
            <a
              href="https://discord.gg/yXG3w7wxfs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              Discord
            </a>
            <button
              onClick={() => requireAuth(() => setShowPublishDialog(true))}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-forest px-4 text-sm font-medium text-white transition-colors hover:bg-forest/90"
            >
              <UploadCloud className="h-4 w-4" />
              Publish
            </button>
          </div>
        </div>

        <form onSubmit={handleSearch} className="mt-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects, creators, or tags..."
              className="h-11 border-white/10 bg-white/[0.04] pl-10 text-sm text-white placeholder:text-white/40 focus-visible:ring-1 focus-visible:ring-forest/50"
            />
          </div>
        </form>
      </div>

      <div className="w-full px-4 pb-16 sm:px-6 lg:px-8">
        {/* Featured Projects */}
        {featuredPosts && featuredPosts.length > 0 && (
          <section className="mb-16">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Featured Projects
                  </h2>
                  <p className="text-sm text-white/55">
                    Hand-picked by our team
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {featuredPosts.map((post) => (
                <ProjectCard key={post._id} post={post} variant="featured" />
              ))}
            </div>
          </section>
        )}

        {/* Trending & Top Creators Grid */}
        <div className="grid gap-10 lg:grid-cols-3">
          {/* Trending Projects */}
          <div className="lg:col-span-2">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-forest-bright" />
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Trending Now
                  </h2>
                  <p className="text-sm text-white/55">
                    Most loved projects this week
                  </p>
                </div>
              </div>
              <Link
                href="/web/community/explore"
                className="flex items-center gap-1 text-sm text-forest-bright hover:text-forest-bright/80"
              >
                See all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {!trendingPosts ? (
              <div className="grid gap-6 sm:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-72 rounded-2xl bg-white/[0.05]" />
                ))}
              </div>
            ) : trendingPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-16 text-center">
                <h3 className="mb-2 text-lg font-medium text-white">
                  No projects yet
                </h3>
                <p className="mb-4 text-sm text-white/55">
                  Publish a deployed project to make it visible here.
                </p>
                <Button
                  onClick={() => setShowPublishDialog(true)}
                  variant="outline"
                  className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                >
                  Create Listing
                </Button>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                {trendingPosts.slice(0, 4).map((post) => (
                  <ProjectCard key={post._id} post={post} />
                ))}
              </div>
            )}
          </div>

          {/* Top Creators Sidebar */}
          <div>
            <div className="mb-6 flex items-center gap-3">
              <Trophy className="h-5 w-5 text-forest-bright" />
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Top Creators
                </h2>
                <p className="text-sm text-white/55">Most loved builders</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              {!topCreators ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full bg-white/[0.05]" />
                      <div className="flex-1">
                        <Skeleton className="mb-1 h-4 w-24 bg-white/[0.05]" />
                        <Skeleton className="h-3 w-16 bg-white/[0.05]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : topCreators.length === 0 ? (
                <div className="py-8 text-center text-sm text-white/45">
                  No creators yet
                </div>
              ) : (
                <div className="space-y-3">
                  {topCreators.map((creator) => (
                      <Link
                      key={creator._id}
                      href={`/web/community/profile/${creator._id}`}
                      className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/[0.06]"
                    >
                      <div className="relative">
                        <div
                          className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full ${
                            creator.rank === 1
                              ? "ring-2 ring-amber-400"
                              : creator.rank === 2
                                ? "ring-2 ring-gray-400"
                                : creator.rank === 3
                                  ? "ring-2 ring-amber-600"
                                  : ""
                          }`}
                        >
                          {creator.profileImage ? (
                            <img
                              src={creator.profileImage}
                              alt={creator.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-forest/15 text-sm font-medium text-forest-bright">
                              {creator.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        {creator.rank <= 3 && (
                          <div
                            className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                              creator.rank === 1
                                ? "bg-amber-400 text-amber-900"
                                : creator.rank === 2
                                  ? "bg-muted text-foreground"
                                  : "bg-amber-600 text-amber-100"
                            }`}
                          >
                            {creator.rank}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-white group-hover:text-forest-bright">
                          {creator.name}
                        </span>
                        <div className="flex items-center gap-3 text-xs text-white/45">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {creator.totalLikesReceived}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {creator.followersCount}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              <Link
                href="/web/community/leaderboard"
                className="mt-4 flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] py-2.5 text-sm text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                View Leaderboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

      </div>

      <PublishProjectDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
      />
    </div>
  );
}
