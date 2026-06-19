"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Search,
  UploadCloud,
  LayoutGrid,
  Users,
  Heart,
  FolderGit2,
  Loader2,
} from "lucide-react";
import { Input } from "@/vly/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/vly/components/ui/select";
import { Skeleton } from "@/vly/components/ui/skeleton";
import ProjectCard from "./ProjectCard";
import PublishProjectDialog from "./PublishProjectDialog";
import { useRequireAuth } from "@/vly/components/auth/AuthComponents";
import { cn } from "@/vly/lib/utils";
import type { CommunityPostCardData } from "@/vly/lib/community-types";

type SortOption = "recent" | "popular";
type Mode = "projects" | "people";

const PAGE_SIZE = 24;

export default function ExploreFeed({
  initialPosts = [],
  initialSearchQuery,
}: {
  initialPosts?: CommunityPostCardData[];
  initialSearchQuery?: string;
}) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || initialSearchQuery || "";

  const [mode, setMode] = useState<Mode>("projects");
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const { requireAuth } = useRequireAuth();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="min-h-full pb-24">
      {/* Header — transparent so the night-sky backdrop shows through */}
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="lp-hero-heading text-3xl font-normal tracking-tight text-white">
                Explore the community
              </h1>
              <p className="mt-1 text-sm text-white/55">
                Discover projects and the builders behind them.
              </p>
            </div>
            <button
              onClick={() => requireAuth(() => setShowPublishDialog(true))}
              className="inline-flex h-9 items-center gap-2 self-start rounded-full bg-forest px-4 text-sm font-medium text-white transition-colors hover:bg-forest/90"
            >
              <UploadCloud className="h-4 w-4" />
              Create Listing
            </button>
          </div>

          {/* Mode toggle: Projects / People */}
          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
            <ModeTab
              active={mode === "projects"}
              onClick={() => setMode("projects")}
              icon={<LayoutGrid className="h-4 w-4" />}
              label="Projects"
            />
            <ModeTab
              active={mode === "people"}
              onClick={() => setMode("people")}
              icon={<Users className="h-4 w-4" />}
              label="People"
            />
          </div>

          {/* Search & filters */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  mode === "people"
                    ? "Search builders by name..."
                    : "Search projects by title..."
                }
                className="h-11 border-white/10 bg-white/[0.04] pl-11 text-white placeholder:text-white/40 focus-visible:ring-1 focus-visible:ring-forest/50"
              />
            </div>

            {mode === "projects" && !debouncedQuery && (
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as SortOption)}
              >
                <SelectTrigger className="h-11 w-full border-white/10 bg-white/[0.04] text-white sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0b1118] text-white">
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="popular">Most Popular</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        {mode === "projects" ? (
          <ProjectsView
            debouncedQuery={debouncedQuery}
            sortBy={sortBy}
            initialPosts={initialPosts}
            onPublish={() => requireAuth(() => setShowPublishDialog(true))}
          />
        ) : (
          <PeopleView debouncedQuery={debouncedQuery} />
        )}
      </div>

      <PublishProjectDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
      />
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
        active
          ? "bg-white/10 text-white"
          : "text-white/55 hover:bg-white/5 hover:text-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(9)].map((_, i) => (
        <Skeleton key={i} className="h-80 rounded-2xl bg-white/[0.04]" />
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  onPublish,
}: {
  title: string;
  body: string;
  onPublish?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h3 className="mb-2 text-xl font-medium text-white">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-white/50">{body}</p>
      {onPublish && (
        <button
          onClick={onPublish}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-forest px-4 text-sm font-medium text-white transition-colors hover:bg-forest/90"
        >
          <UploadCloud className="h-4 w-4" />
          Create Listing
        </button>
      )}
    </div>
  );
}

/* ── Projects: search / popular (single page) or recent (infinite scroll) ── */
function ProjectsView({
  debouncedQuery,
  sortBy,
  initialPosts,
  onPublish,
}: {
  debouncedQuery: string;
  sortBy: SortOption;
  initialPosts: CommunityPostCardData[];
  onPublish: () => void;
}) {
  if (debouncedQuery) {
    return <SearchProjects query={debouncedQuery} onPublish={onPublish} />;
  }
  if (sortBy === "popular") {
    return <PopularProjects onPublish={onPublish} />;
  }
  return <RecentProjects initialPosts={initialPosts} onPublish={onPublish} />;
}

function SearchProjects({
  query,
  onPublish,
}: {
  query: string;
  onPublish: () => void;
}) {
  const results = useQuery(api.community.searchPosts, {
    searchQuery: query,
    limit: 30,
  });
  if (!results) return <GridSkeleton />;
  if (results.length === 0) {
    return (
      <EmptyState
        title="No projects found"
        body="Try adjusting your search terms."
        onPublish={onPublish}
      />
    );
  }
  return (
    <>
      <p className="mb-6 text-sm text-white/45">
        {results.length} results for &quot;{query}&quot;
      </p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((post) => (
          <ProjectCard key={post._id} post={post} />
        ))}
      </div>
    </>
  );
}

function PopularProjects({ onPublish }: { onPublish: () => void }) {
  const posts = useQuery(api.community.getTrendingPosts, { limit: 30 });
  if (!posts) return <GridSkeleton />;
  if (posts.length === 0) {
    return (
      <EmptyState
        title="No projects yet"
        body="Publish a deployed project to make it visible here."
        onPublish={onPublish}
      />
    );
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <ProjectCard key={post._id} post={post} />
      ))}
    </div>
  );
}

function RecentProjects({
  initialPosts,
  onPublish,
}: {
  initialPosts: CommunityPostCardData[];
  onPublish: () => void;
}) {
  // Each entry is the cursor a page starts from (undefined = first page).
  const [pageCursors, setPageCursors] = useState<(number | undefined)[]>([
    undefined,
  ]);
  // Loaded posts keyed by page index, so we can render a single merged grid.
  const [pages, setPages] = useState<Record<number, CommunityPostCardData[]>>(
    {},
  );
  // nextCursor reported by the most recently loaded last page.
  //   undefined → still loading; null → no more pages; number → more to load
  const [nextCursor, setNextCursor] = useState<number | null | undefined>(
    undefined,
  );
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handlePagePosts = useCallback(
    (index: number, posts: CommunityPostCardData[]) => {
      setPages((prev) => ({ ...prev, [index]: posts }));
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (typeof nextCursor !== "number") return; // loading or finished
    setPageCursors((prev) =>
      prev.includes(nextCursor) ? prev : [...prev, nextCursor],
    );
    setNextCursor(undefined);
  }, [nextCursor]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const mergedPosts = pageCursors.flatMap((_, i) => pages[i] ?? []);
  const firstPageLoaded = pages[0] !== undefined;
  const isInitialLoading = !firstPageLoaded && initialPosts.length === 0;
  const isEmpty = firstPageLoaded && mergedPosts.length === 0;

  if (isInitialLoading) return <GridSkeleton />;

  if (isEmpty) {
    return (
      <EmptyState
        title="No projects yet"
        body="Publish a deployed project to make it visible here."
        onPublish={onPublish}
      />
    );
  }

  const displayPosts = firstPageLoaded ? mergedPosts : initialPosts;

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {displayPosts.map((post) => (
          <ProjectCard key={post._id} post={post} />
        ))}
      </div>

      {/* Hidden loaders that drive each page's Convex subscription */}
      <div className="hidden">
        {pageCursors.map((cursor, i) => (
          <ExplorePage
            key={i}
            index={i}
            cursor={cursor}
            isLast={i === pageCursors.length - 1}
            onPosts={handlePagePosts}
            onNext={setNextCursor}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="h-10" />

      {typeof nextCursor === "number" && pageCursors.length > 1 && (
        <div className="flex items-center justify-center py-8 text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
    </>
  );
}

function ExplorePage({
  index,
  cursor,
  isLast,
  onPosts,
  onNext,
}: {
  index: number;
  cursor: number | undefined;
  isLast: boolean;
  onPosts: (index: number, posts: CommunityPostCardData[]) => void;
  onNext: (next: number | null) => void;
}) {
  const data = useQuery(api.community.getExplorePosts, {
    limit: PAGE_SIZE,
    cursor,
  });

  useEffect(() => {
    if (!data) return;
    onPosts(index, data.posts);
    if (isLast) onNext(data.nextCursor);
  }, [data, index, isLast, onPosts, onNext]);

  return null;
}

/* ── People: builder directory with client-side name filtering ── */
function PeopleView({ debouncedQuery }: { debouncedQuery: string }) {
  const creators = useQuery(api.community.getTopCreators, { limit: 60 });

  const filtered = useMemo(() => {
    if (!creators) return undefined;
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter((c) => c.name.toLowerCase().includes(q));
  }, [creators, debouncedQuery]);

  if (!filtered) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(9)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        title={debouncedQuery ? "No builders found" : "No builders yet"}
        body={
          debouncedQuery
            ? "Try a different name."
            : "Builders appear here once they publish projects."
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((creator) => (
        <Link
          key={creator._id}
          href={`/web/community/profile/${creator._id}`}
          className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
        >
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
            {creator.profileImage ? (
              <img
                src={creator.profileImage}
                alt={creator.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-base font-medium text-forest-bright">
                {creator.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate font-medium text-white group-hover:text-forest-bright">
              {creator.name}
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/45">
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {creator.totalLikesReceived}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {creator.followersCount}
              </span>
              <span className="flex items-center gap-1">
                <FolderGit2 className="h-3 w-3" />
                {creator.postsCount}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
