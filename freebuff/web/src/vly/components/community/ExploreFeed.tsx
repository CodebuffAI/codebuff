"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, SlidersHorizontal, Rocket } from "lucide-react";
import { Input } from "@/vly/components/ui/input";
import { Button } from "@/vly/components/ui/button";
import { Skeleton } from "@/vly/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/vly/components/ui/select";
import ProjectCard from "./ProjectCard";
import PublishProjectDialog from "./PublishProjectDialog";
import { useCommunityBadgeTierSync } from "@/vly/hooks/useCommunityBadgeTierSync";

type SortOption = "recent" | "popular" | "trending";

export default function ExploreFeed() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [showPublishDialog, setShowPublishDialog] = useState(false);

  // Sync community badge tier for the current user
  useCommunityBadgeTierSync();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Queries based on sort/search
  const explorePosts = useQuery(
    api.community.getExplorePosts,
    sortBy === "recent" && !debouncedQuery ? { limit: 30 } : "skip",
  );

  const trendingPosts = useQuery(
    api.community.getTrendingPosts,
    sortBy === "trending" && !debouncedQuery ? { limit: 30 } : "skip",
  );

  const searchResults = useQuery(
    api.community.searchPosts,
    debouncedQuery ? { searchQuery: debouncedQuery, limit: 30 } : "skip",
  );

  // Get current posts based on mode
  const currentPosts = debouncedQuery
    ? searchResults
    : sortBy === "trending"
      ? trendingPosts
      : explorePosts?.posts;

  const isLoading = !currentPosts;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-20">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Explore Projects
              </h1>
              <p className="mt-1 text-gray-500">
                Discover amazing projects built by the Vly community
              </p>
            </div>
            <Button
              onClick={() => setShowPublishDialog(true)}
              className="gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-200 hover:from-violet-500 hover:to-fuchsia-500"
            >
              <Rocket className="h-4 w-4" />
              Create Listing
            </Button>
          </div>

          {/* Search & Filters */}
          <div className="mt-6 flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects, tags, creators..."
                className="h-12 border-gray-200 bg-white pl-12 text-gray-900 placeholder:text-gray-400 focus:border-violet-400 focus:ring-violet-200"
              />
            </div>

            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as SortOption)}
            >
              <SelectTrigger className="h-12 w-full border-gray-200 bg-white text-gray-900 sm:w-48">
                <SlidersHorizontal className="mr-2 h-4 w-4 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-gray-200 bg-white text-gray-900">
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="trending">Most Popular</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        {debouncedQuery && (
          <p className="mb-6 text-sm text-gray-500">
            {searchResults?.length || 0} results for "{debouncedQuery}"
          </p>
        )}

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(9)].map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : currentPosts && currentPosts.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {currentPosts.map((post) => (
              <ProjectCard key={post._id} post={post} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-50">
              <Search className="h-10 w-10 text-violet-500" />
            </div>
            <h3 className="mb-2 text-xl font-medium text-gray-900">
              {debouncedQuery ? "No projects found" : "No projects yet"}
            </h3>
            <p className="mb-6 max-w-sm text-gray-500">
              {debouncedQuery
                ? "Try adjusting your search terms"
                : "Be the first to share your creation with the community!"}
            </p>
            <Button
              onClick={() => setShowPublishDialog(true)}
              className="gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-200 hover:from-violet-500 hover:to-fuchsia-500"
            >
              <Rocket className="h-4 w-4" />
              Create Listing
            </Button>
          </div>
        )}
      </div>

      <PublishProjectDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
      />
    </div>
  );
}
