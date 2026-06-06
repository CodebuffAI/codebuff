"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, SlidersHorizontal, UploadCloud } from "lucide-react";
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

type SortOption = "recent" | "popular" | "trending";

export default function ExploreFeed() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [showPublishDialog, setShowPublishDialog] = useState(false);

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
    <div className="min-h-full pb-20">
      {/* Header */}
      <div className="border-b border-border/50 bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Explore Projects
              </h1>
              <p className="mt-1 text-muted-foreground">
                Search public projects by name, creator, or tag.
              </p>
            </div>
            <Button
              onClick={() => setShowPublishDialog(true)}
              className="h-9 gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-none hover:bg-primary/90"
            >
              <UploadCloud className="h-4 w-4" />
              Create Listing
            </Button>
          </div>

          {/* Search & Filters */}
          <div className="mt-6 flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects, tags, creators..."
                className="h-12 border-border/60 bg-muted/20 pl-12 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
              />
            </div>

            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as SortOption)}
            >
              <SelectTrigger className="h-12 w-full border-border/60 bg-muted/20 text-foreground sm:w-48">
                <SlidersHorizontal className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-popover text-popover-foreground">
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
          <p className="mb-6 text-sm text-muted-foreground">
            {searchResults?.length || 0} results for "{debouncedQuery}"
          </p>
        )}

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(9)].map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-lg bg-muted/35" />
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
            <h3 className="mb-2 text-xl font-medium text-foreground">
              {debouncedQuery ? "No projects found" : "No projects yet"}
            </h3>
            <p className="mb-6 max-w-sm text-muted-foreground">
              {debouncedQuery
                ? "Try adjusting your search terms"
                : "Publish a deployed project to make it visible here."}
            </p>
            <Button
              onClick={() => setShowPublishDialog(true)}
              className="h-9 gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-none hover:bg-primary/90"
            >
              <UploadCloud className="h-4 w-4" />
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
