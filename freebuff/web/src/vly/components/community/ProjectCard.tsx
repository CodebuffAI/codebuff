"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Heart,
  MessageCircle,
  Eye,
  ExternalLink,
  Sparkles,
  Lock,
} from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/vly/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/vly/components/ui/avatar";
import { Badge } from "@/vly/components/ui/badge";
import { CommunityBadge } from "./CommunityBadge";

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
        className="group flex items-center gap-4 rounded-lg bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)] transition-all hover:shadow-[0_2px_4px_rgba(0,0,0,0.16),0_2px_4px_rgba(0,0,0,0.23)]"
      >
        {showRank && (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-[#F9FBFD] font-mono text-sm font-medium text-[#4285F4]">
            #{showRank}
          </div>
        )}

        {/* Thumbnail */}
        <div className="relative h-12 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {post.screenshotUrl ? (
            <img
              src={post.screenshotUrl}
              alt={post.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#F9FBFD]">
              <span className="text-lg">🚀</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="truncate font-medium text-gray-800 group-hover:text-[#1a73e8]">
            {post.title}
          </h4>
          <p className="text-sm text-gray-500">by {post.userName}</p>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500">
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
        "group relative flex flex-col overflow-hidden rounded-lg transition-all duration-300",
        variant === "featured"
          ? "bg-white shadow-[0_2px_4px_rgba(0,0,0,0.16),0_2px_4px_rgba(0,0,0,0.23)] hover:shadow-[0_3px_6px_rgba(0,0,0,0.20),0_3px_6px_rgba(0,0,0,0.28)]"
          : "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.16),0_2px_4px_rgba(0,0,0,0.23)]",
      )}
    >
      {/* Rank Badge */}
      {showRank && (
        <div className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-white/95 font-mono text-sm font-medium text-[#4285F4] shadow-sm backdrop-blur-sm">
          #{showRank}
        </div>
      )}

      {/* Featured/Private Badge */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
        {post.isPublic === false && (
          <Badge className="border-0 bg-amber-100 text-amber-700 shadow-sm">
            <Lock className="mr-1 h-3 w-3" />
            Private
          </Badge>
        )}
        {post.featured && (
          <Badge className="border-0 bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-sm">
            <Sparkles className="mr-1 h-3 w-3" />
            Featured
          </Badge>
        )}
      </div>

      {/* Preview Image */}
      <div className="relative aspect-video w-full overflow-hidden bg-gray-50">
        {post.screenshotUrl ? (
          <div className="relative h-full w-full">
            <img
              src={post.screenshotUrl}
              alt={post.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent opacity-40" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#F9FBFD]">
            <span className="text-4xl">🚀</span>
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
            className="absolute right-2 top-2 rounded-lg bg-white/90 p-2 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100"
            title="Open live site"
          >
            <ExternalLink className="h-4 w-4 text-gray-600" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Title & Description */}
        <h3 className="mb-1 line-clamp-1 text-lg font-medium text-gray-800 group-hover:text-[#1a73e8]">
          {post.title}
        </h3>
        <p className="mb-3 line-clamp-2 text-sm text-gray-500">
          {post.description}
        </p>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
              >
                {tag}
              </span>
            ))}
            {post.tags.length > 3 && (
              <span className="text-xs text-gray-400">
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
              <AvatarFallback className="bg-[#F9FBFD] text-xs text-[#4285F4]">
                {post.userName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-gray-600">{post.userName}</span>
            {post.communityBadgeTier && post.communityBadgeTier > 0 ? (
              <CommunityBadge
                communityBadgeTier={post.communityBadgeTier}
                size="sm"
              />
            ) : post.isPaidUser ? (
              <Badge
                variant="outline"
                className="h-4 border-gray-200 bg-[#F9FBFD] px-1 py-0 text-[10px] text-[#4285F4]"
              >
                PRO
              </Badge>
            ) : null}
          </button>

          <div className="flex items-center gap-3 text-sm text-gray-500">
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
        <p className="mt-2 text-xs text-gray-400">
          {formatDistanceToNow(post.publishedAt, { addSuffix: true })}
        </p>
      </div>
    </Link>
  );
}
