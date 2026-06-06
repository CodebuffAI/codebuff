"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Heart,
  MessageCircle,
  Eye,
  ExternalLink,
  ImageIcon,
} from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/vly/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/vly/components/ui/avatar";

interface ProjectCardProps {
  post: {
    _id: Id<"community_posts">;
    projectId: Id<"project">;
    userId: Id<"users">;
    title: string;
    description: string;
    tags: string[];
    screenshotUrl?: string;
    previewUrl?: string;
    likesCount: number;
    commentsCount: number;
    viewsCount: number;
    featured?: boolean;
    isPublic?: boolean;
    publishedAt: number;
    userName: string;
    userImage?: string;
    isPaidUser: boolean;
    communityBadgeTier?: number;
    hasLiked: boolean;
  };
  showRank?: number;
  variant?: "default" | "compact" | "featured";
}

export default function ProjectCard({
  post,
  showRank,
  variant = "default",
}: ProjectCardProps) {
  const [isLiking, setIsLiking] = useState(false);
  const [optimisticLiked, setOptimisticLiked] = useState(post.hasLiked);
  const [optimisticLikes, setOptimisticLikes] = useState(post.likesCount);

  const likePost = useMutation(api.community.likePost);
  const unlikePost = useMutation(api.community.unlikePost);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isLiking) return;
    setIsLiking(true);

    try {
      if (optimisticLiked) {
        setOptimisticLiked(false);
        setOptimisticLikes((prev) => Math.max(0, prev - 1));
        await unlikePost({ postId: post._id });
      } else {
        setOptimisticLiked(true);
        setOptimisticLikes((prev) => prev + 1);
        await likePost({ postId: post._id });
      }
    } catch {
      // Revert on error
      setOptimisticLiked(post.hasLiked);
      setOptimisticLikes(post.likesCount);
    } finally {
      setIsLiking(false);
    }
  };

  if (variant === "compact") {
    return (
      <Link
        href={`/web/community/project/${post._id}`}
        className="group flex items-center gap-4 rounded-lg border border-border/50 bg-muted/20 p-3 transition-colors hover:bg-muted/35"
      >
        {showRank && (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-background/70 font-mono text-sm font-medium text-primary">
            #{showRank}
          </div>
        )}

        {/* Thumbnail */}
        <div className="relative h-12 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted/45">
          {post.screenshotUrl ? (
            <img
              src={post.screenshotUrl}
              alt={post.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="truncate font-medium text-foreground group-hover:text-primary">
            {post.title}
          </h4>
          <p className="text-sm text-muted-foreground">by {post.userName}</p>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Heart
            className={cn(
              "h-4 w-4",
              optimisticLiked && "fill-rose-500 text-rose-500",
            )}
          />
          <span>{optimisticLikes}</span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/web/community/project/${post._id}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/20 transition-colors",
        variant === "featured"
          ? "hover:border-primary/45 hover:bg-muted/35"
          : "hover:border-border hover:bg-muted/30",
      )}
    >
      {/* Rank Badge */}
      {showRank && (
        <div className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background/90 font-mono text-sm font-medium text-primary backdrop-blur-sm">
          #{showRank}
        </div>
      )}

      {/* Preview Image */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted/45">
        {post.screenshotUrl ? (
          <div className="relative h-full w-full">
            <img
              src={post.screenshotUrl}
              alt={post.title}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="rounded-md bg-background/65 px-3 py-2 text-xs font-medium text-muted-foreground">
              No preview
            </div>
          </div>
        )}

        {/* Open live site in new tab */}
        {post.previewUrl && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(post.previewUrl, "_blank");
            }}
            className="absolute right-2 top-2 rounded-lg border border-border/60 bg-background/90 p-2 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
            title="Open live site"
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Title & Description */}
        <h3 className="mb-1 line-clamp-1 text-lg font-medium text-foreground group-hover:text-primary">
          {post.title}
        </h3>
        <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
          {post.description}
        </p>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border/50 bg-background/55 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {post.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{post.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Author & Stats */}
        <div className="mt-auto flex items-center justify-between">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.location.href = `/web/community/profile/${post.userId}`;
            }}
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <Avatar className="h-6 w-6">
              <AvatarImage src={post.userImage} />
              <AvatarFallback className="bg-background/70 text-xs text-primary">
                {post.userName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground">
              {post.userName}
            </span>
          </button>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <button
              onClick={handleLike}
              className={cn(
                "flex items-center gap-1 transition-colors",
                optimisticLiked ? "text-rose-500" : "hover:text-rose-500",
              )}
            >
              <Heart
                className={cn(
                  "h-4 w-4 transition-all",
                  optimisticLiked && "scale-110 fill-current",
                )}
              />
              <span>{optimisticLikes}</span>
            </button>
            <div className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4" />
              <span>{post.commentsCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              <span>{post.viewsCount}</span>
            </div>
          </div>
        </div>

        {/* Time */}
        <p className="mt-2 text-xs text-muted-foreground">
          {formatDistanceToNow(post.publishedAt, { addSuffix: true })}
        </p>
      </div>
    </Link>
  );
}
