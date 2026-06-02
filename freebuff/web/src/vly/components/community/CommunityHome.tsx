"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Rocket,
  TrendingUp,
  Sparkles,
  Trophy,
  ArrowRight,
  Search,
  Users,
  Heart,
} from "lucide-react";
import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import { Skeleton } from "@/vly/components/ui/skeleton";
import ProjectCard from "./ProjectCard";
import PublishProjectDialog from "./PublishProjectDialog";
import { CommunityBadge } from "./CommunityBadge";
import { useCommunityBadgeTierSync } from "@/vly/hooks/useCommunityBadgeTierSync";

export default function CommunityHome() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showPublishDialog, setShowPublishDialog] = useState(false);

  // Sync community badge tier for the current user
  useCommunityBadgeTierSync();

  const featuredPosts = useQuery(api.community.getFeaturedPosts, { limit: 4 });
  const trendingPosts = useQuery(api.community.getTrendingPosts, { limit: 6 });
  const topCreators = useQuery(api.community.getTopCreators, { limit: 5 });

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
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-6 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-['PP_Cirka'] text-2xl font-normal leading-none text-foreground sm:text-3xl">
            Explore the community
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Projects built by creators worldwide.
          </p>
        </div>

        <form onSubmit={handleSearch} className="mx-auto mt-5 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="h-10 border-0 bg-muted/40 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
            />
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://discord.gg/2gSmB9DxJW"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Join Discord
          </a>
          <button
            onClick={() => setShowPublishDialog(true)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_18px_rgba(124,255,63,0.35)]"
          >
            <Rocket className="h-4 w-4" />
            Publish a project
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {/* Featured Projects */}
        {featuredPosts && featuredPosts.length > 0 && (
          <section className="mb-16">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Featured Projects
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Hand-picked by our team
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {featuredPosts.map((post) => (
                <ProjectCard key={post._id} post={post} variant="featured" />
              ))}
            </div>
          </section>
        )}

        {/* Trending & Top Creators Grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Trending Projects */}
          <div className="lg:col-span-2">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Trending Now
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Most loved projects this week
                  </p>
                </div>
              </div>
              <Link
                href="/web/community/explore"
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
              >
                See all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {!trendingPosts ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-72 rounded-2xl bg-muted/40" />
                ))}
              </div>
            ) : trendingPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl bg-muted/25 py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary/15">
                  <Rocket className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-medium text-foreground">
                  No projects yet
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Be the first to share your creation!
                </p>
                <Button
                  onClick={() => setShowPublishDialog(true)}
                  variant="outline"
                  className="border-0 bg-muted/50 text-foreground hover:bg-muted"
                >
                  Create Listing
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {trendingPosts.slice(0, 4).map((post) => (
                  <ProjectCard key={post._id} post={post} />
                ))}
              </div>
            )}
          </div>

          {/* Top Creators Sidebar */}
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Top Creators
                </h2>
                <p className="text-sm text-muted-foreground">Most loved builders</p>
              </div>
            </div>

            <div className="rounded-2xl bg-muted/25 p-4">
              {!topCreators ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full bg-muted/40" />
                      <div className="flex-1">
                        <Skeleton className="mb-1 h-4 w-24 bg-muted/40" />
                        <Skeleton className="h-3 w-16 bg-muted/40" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : topCreators.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No creators yet
                </div>
              ) : (
                <div className="space-y-3">
                  {topCreators.map((creator) => (
                      <Link
                      key={creator._id}
                      href={`/web/community/profile/${creator._id}`}
                      className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/40"
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
                            <div className="flex h-full w-full items-center justify-center bg-primary/15 text-sm font-medium text-primary">
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
                                  ? "bg-gray-400 text-gray-900"
                                  : "bg-amber-600 text-amber-100"
                            }`}
                          >
                            {creator.rank}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-foreground group-hover:text-primary">
                            {creator.name}
                          </span>
                          {(creator as any).communityBadgeTier &&
                          (creator as any).communityBadgeTier > 0 ? (
                            <CommunityBadge
                              communityBadgeTier={
                                (creator as any).communityBadgeTier
                              }
                              size="sm"
                              showIcon={false}
                            />
                          ) : creator.isPaidUser ? (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              PRO
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
                className="mt-4 flex items-center justify-center gap-1 rounded-xl bg-muted/40 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
              >
                View Leaderboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <section className="mt-12">
          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/web/community/explore"
              className="group flex flex-col items-center rounded-2xl bg-muted/25 p-6 text-center transition-colors hover:bg-muted/40"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="mb-1 font-medium text-foreground group-hover:text-primary">
                Explore All
              </h3>
              <p className="text-sm text-muted-foreground">Browse all projects</p>
            </Link>

            <Link
              href="/web/community/leaderboard"
              className="group flex flex-col items-center rounded-2xl bg-muted/25 p-6 text-center transition-colors hover:bg-muted/40"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Trophy className="h-6 w-6" />
              </div>
              <h3 className="mb-1 font-medium text-foreground group-hover:text-primary">
                Leaderboard
              </h3>
              <p className="text-sm text-muted-foreground">Top projects & creators</p>
            </Link>

            <Link
              href="/web"
              className="group flex flex-col items-center rounded-2xl bg-muted/25 p-6 text-center transition-colors hover:bg-muted/40"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="mb-1 font-medium text-foreground group-hover:text-primary">
                Start Building
              </h3>
              <p className="text-sm text-muted-foreground">Create with Freebuff Web</p>
            </Link>
          </div>
        </section>
      </div>

      <PublishProjectDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
      />
    </div>
  );
}
