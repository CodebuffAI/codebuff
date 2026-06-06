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

export default function CommunityHome() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showPublishDialog, setShowPublishDialog] = useState(false);

  const featuredPosts = useQuery(api.community.getFeaturedPosts, { limit: 4 });
  const trendingPosts = useQuery(api.community.getTrendingPosts, { limit: 6 });
  const topCreators = useQuery(api.community.getTopCreators, { limit: 5 });
  const currentUserId = useQuery(api.community.getCurrentUserId);

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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Community directory
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
              Search public Freebuff projects, creators, and tags.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentUserId && (
              <Link
                href={`/web/community/profile/${currentUserId}`}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border/60 bg-muted/25 px-3 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
              >
                <User className="h-4 w-4" />
                Profile
              </Link>
            )}
            <a
              href="https://discord.gg/yXG3w7wxfs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-border/60 bg-muted/25 px-3 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
            >
              Discord
            </a>
            <button
              onClick={() => setShowPublishDialog(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <UploadCloud className="h-4 w-4" />
              Publish
            </button>
          </div>
        </div>

        <form onSubmit={handleSearch} className="mt-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects, creators, or tags..."
              className="h-11 border-border/60 bg-muted/25 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
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
                  <h2 className="text-xl font-semibold text-foreground">
                    Featured Projects
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Hand-picked by our team
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
                <TrendingUp className="h-5 w-5 text-primary" />
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
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-72 rounded-2xl bg-muted/40" />
                ))}
              </div>
            ) : trendingPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border/50 bg-muted/20 py-16 text-center">
                <h3 className="mb-2 text-lg font-medium text-foreground">
                  No projects yet
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Publish a deployed project to make it visible here.
                </p>
                <Button
                  onClick={() => setShowPublishDialog(true)}
                  variant="outline"
                  className="border-border/60 bg-background text-foreground hover:bg-muted"
                >
                  Create Listing
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {trendingPosts.slice(0, 4).map((post) => (
                  <ProjectCard key={post._id} post={post} />
                ))}
              </div>
            )}
          </div>

          {/* Top Creators Sidebar */}
          <div>
            <div className="mb-6 flex items-center gap-3">
              <Trophy className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Top Creators
                </h2>
                <p className="text-sm text-muted-foreground">Most loved builders</p>
              </div>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
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
                      className="group flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-muted/40"
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
                                  ? "bg-muted text-foreground"
                                  : "bg-amber-600 text-amber-100"
                            }`}
                          >
                            {creator.rank}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground group-hover:text-primary">
                          {creator.name}
                        </span>
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
                className="mt-4 flex items-center justify-center gap-1 rounded-md border border-border/50 bg-background/50 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
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
