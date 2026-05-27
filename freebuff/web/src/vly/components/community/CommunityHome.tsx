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
    <div className="min-h-screen">
      {/* Hero Section - Compact with floating emojis */}
      <div className="relative mt-8 overflow-hidden">
        {/* Floating emojis */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span
            className="absolute left-[10%] top-4 animate-bounce text-2xl opacity-60"
            style={{ animationDelay: "0s", animationDuration: "3s" }}
          >
            🚀
          </span>
          <span
            className="absolute right-[15%] top-8 animate-bounce text-xl opacity-50"
            style={{ animationDelay: "0.5s", animationDuration: "2.5s" }}
          >
            ✨
          </span>
          <span
            className="absolute left-[20%] top-16 animate-bounce text-lg opacity-40"
            style={{ animationDelay: "1s", animationDuration: "3.5s" }}
          >
            💡
          </span>
          <span
            className="absolute right-[25%] top-2 animate-bounce text-2xl opacity-50"
            style={{ animationDelay: "1.5s", animationDuration: "2.8s" }}
          >
            🎨
          </span>
          <span
            className="absolute left-[5%] top-12 animate-bounce text-lg opacity-40"
            style={{ animationDelay: "0.8s", animationDuration: "3.2s" }}
          >
            ⚡
          </span>
          <span
            className="absolute right-[8%] top-20 animate-bounce text-xl opacity-50"
            style={{ animationDelay: "0.3s", animationDuration: "2.7s" }}
          >
            🔥
          </span>
          <span
            className="absolute left-[30%] top-6 animate-bounce text-lg opacity-30"
            style={{ animationDelay: "2s", animationDuration: "3.3s" }}
          >
            💜
          </span>
          <span
            className="absolute right-[35%] top-14 animate-bounce text-xl opacity-40"
            style={{ animationDelay: "0.7s", animationDuration: "2.9s" }}
          >
            🌟
          </span>
        </div>

        <div className="relative mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6 lg:px-8">
          {/* Title */}
          <h1 className="mb-2 text-center font-['Geist'] text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Explore our community
          </h1>

          <p className="mx-auto mb-5 max-w-xl text-center text-sm text-gray-500">
            Explore projects built by creators worldwide
          </p>

          {/* Search */}
          <form onSubmit={handleSearch} className="mx-auto max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="h-10 border-gray-200 bg-white pl-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#4285F4] focus:ring-[#4285F4]/20"
              />
            </div>
          </form>

          {/* Action Buttons */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <a
              href="https://discord.gg/2gSmB9DxJW"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-600 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-md"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Join Discord Community
            </a>
            <Link
              href="/web/community/explore"
              className="inline-flex items-center gap-2 rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.16)] transition-all hover:bg-[#1557b0] hover:shadow-[0_2px_4px_rgba(0,0,0,0.20)]"
            >
              All Projects
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        {/* Featured Projects */}
        {featuredPosts && featuredPosts.length > 0 && (
          <section className="mb-16">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-100">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Featured Projects
                  </h2>
                  <p className="text-sm text-gray-500">
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
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 shadow-lg shadow-rose-100">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Trending Now
                  </h2>
                  <p className="text-sm text-gray-500">
                    Most loved projects this week
                  </p>
                </div>
              </div>
              <Link
                href="/web/community/explore"
                className="flex items-center gap-1 text-sm text-[#1a73e8] hover:text-[#1557b0]"
              >
                See all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {!trendingPosts ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-72 rounded-2xl bg-gray-100" />
                ))}
              </div>
            ) : trendingPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-[#F9FBFD]">
                  <Rocket className="h-8 w-8 text-[#4285F4]" />
                </div>
                <h3 className="mb-2 text-lg font-medium text-gray-900">
                  No projects yet
                </h3>
                <p className="mb-4 text-sm text-gray-500">
                  Be the first to share your creation!
                </p>
                <Button
                  onClick={() => setShowPublishDialog(true)}
                  variant="outline"
                  className="border-gray-200 text-[#1a73e8] hover:bg-[#F9FBFD]"
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
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#4285F4] shadow-sm">
                <Trophy className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Top Creators
                </h2>
                <p className="text-sm text-gray-500">Most loved builders</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              {!topCreators ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full bg-gray-100" />
                      <div className="flex-1">
                        <Skeleton className="mb-1 h-4 w-24 bg-gray-100" />
                        <Skeleton className="h-3 w-16 bg-gray-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : topCreators.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No creators yet
                </div>
              ) : (
                <div className="space-y-3">
                  {topCreators.map((creator) => (
                    <Link
                      key={creator._id}
                      href={`/web/community/profile/${creator._id}`}
                      className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-gray-50"
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
                            <div className="flex h-full w-full items-center justify-center bg-[#F9FBFD] text-sm font-medium text-[#4285F4]">
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
                          <span className="truncate font-medium text-gray-800 group-hover:text-[#1a73e8]">
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
                            <span className="rounded bg-[#F9FBFD] px-1.5 py-0.5 text-[10px] font-medium text-[#4285F4]">
                              PRO
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
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
                className="mt-4 flex items-center justify-center gap-1 rounded-xl bg-gray-50 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                View Leaderboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <section className="mt-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/web/community/explore"
              className="group flex flex-col items-center rounded-lg bg-white p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)] transition-all hover:shadow-[0_2px_4px_rgba(0,0,0,0.16),0_2px_4px_rgba(0,0,0,0.23)]"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 shadow-lg shadow-blue-100">
                <Search className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-1 font-medium text-gray-800 group-hover:text-[#1a73e8]">
                Explore All
              </h3>
              <p className="text-sm text-gray-500">Browse all projects</p>
            </Link>

            <Link
              href="/web/community/leaderboard"
              className="group flex flex-col items-center rounded-lg bg-white p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)] transition-all hover:shadow-[0_2px_4px_rgba(0,0,0,0.16),0_2px_4px_rgba(0,0,0,0.23)]"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-100">
                <Trophy className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-1 font-medium text-gray-800 group-hover:text-[#1a73e8]">
                Leaderboard
              </h3>
              <p className="text-sm text-gray-500">Top projects & creators</p>
            </Link>

            <button
              onClick={() => setShowPublishDialog(true)}
              className="group flex flex-col items-center rounded-lg bg-white p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)] transition-all hover:shadow-[0_2px_4px_rgba(0,0,0,0.16),0_2px_4px_rgba(0,0,0,0.23)]"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-[#4285F4] shadow-sm">
                <Rocket className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-1 font-medium text-gray-800 group-hover:text-[#1a73e8]">
                Create Listing
              </h3>
              <p className="text-sm text-gray-500">Share your creation</p>
            </button>

            <Link
              href="/web/dashboard"
              className="group flex flex-col items-center rounded-lg bg-white p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)] transition-all hover:shadow-[0_2px_4px_rgba(0,0,0,0.16),0_2px_4px_rgba(0,0,0,0.23)]"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-100">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-1 font-medium text-gray-800 group-hover:text-[#1a73e8]">
                Start Building
              </h3>
              <p className="text-sm text-gray-500">Create with Freebuff Web</p>
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
