"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Heart,
  ArrowRight,
  Sparkles,
  Clock,
  FolderOpen,
  Gift,
  Users,
  Zap,
  Star,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { SignedIn } from "@/components/auth/AuthComponents";

interface ProjectCardMiniProps {
  title: string;
  description?: string;
  imageUrl?: string;
  likesCount?: number;
  authorName?: string;
  href: string;
  isPrivate?: boolean;
}

const ProjectCardMini: React.FC<ProjectCardMiniProps> = ({
  title,
  description,
  imageUrl,
  likesCount,
  authorName,
  href,
}) => {
  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_3px_6px_rgba(0,0,0,0.16),0_3px_6px_rgba(0,0,0,0.23)]"
    >
      {/* Image */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#F9FBFD]">
            <span className="text-3xl">🚀</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3">
        <h4 className="mb-1 line-clamp-1 text-sm font-medium text-gray-800 group-hover:text-[#1a73e8]">
          {title}
        </h4>
        {description && (
          <p className="mb-2 line-clamp-2 text-xs text-gray-500">
            {description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between">
          {authorName && (
            <span className="text-xs text-gray-400">by {authorName}</span>
          )}
          {likesCount !== undefined && (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Heart className="h-3 w-3" />
              <span>{likesCount}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

const UserProjectCardMini: React.FC<{
  project: {
    _id: string;
    name?: string;
    semantic_identifier: string;
    screenshotUrl?: string | null;
    last_opened?: number;
  };
}> = ({ project }) => {
  return (
    <Link
      href={`/project/${project.semantic_identifier}`}
      className="group relative flex flex-col overflow-hidden rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_3px_6px_rgba(0,0,0,0.16),0_3px_6px_rgba(0,0,0,0.23)]"
    >
      {/* Image */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100">
        {project.screenshotUrl ? (
          <img
            src={project.screenshotUrl}
            alt={project.name || "Project preview"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#F9FBFD]">
            <div className="text-center">
              <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-white/60 backdrop-blur-sm">
                <FolderOpen className="h-5 w-5 text-gray-400" />
              </div>
              <span className="text-xs text-gray-400">No preview</span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3">
        <h4 className="mb-1 line-clamp-1 text-sm font-medium text-gray-800 group-hover:text-[#1a73e8]">
          {project.name || "Untitled Project"}
        </h4>

        <div className="mt-auto flex items-center justify-between">
          <span className="max-w-[120px] truncate font-mono text-[10px] text-gray-400">
            {project.semantic_identifier}
          </span>
          {project.last_opened && (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="h-3 w-3" />
              <span>
                {formatDistanceToNow(project.last_opened, { addSuffix: false })}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

const EarnCreditsSection: React.FC = () => {
  return (
    <section className="mb-10">
      <div className="overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 via-white to-amber-50/40 p-6 shadow-sm">
        {/* Header */}
        <div className="mb-1 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-0.5 text-xs font-medium text-amber-700">
            <Zap className="h-3 w-3" />
            limited time only
          </span>
        </div>
        <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight text-zinc-900">
          Unlimited free credits for all early users
        </h2>
        <p className="mx-auto mb-5 max-w-lg text-center text-sm leading-relaxed text-zinc-600">
          Earn unlimited free credits as an early user through referral spins
          and bounties.
        </p>

        {/* Badges */}
        <div className="mb-5 flex flex-wrap justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-medium text-emerald-700">
            <Users className="h-3 w-3" />
            Unlimited referral spins
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-medium text-emerald-700">
            <Sparkles className="h-3 w-3" />
            Unlimited bounty rewards
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-medium text-emerald-700">
            <Star className="h-3 w-3" />
            No purchase necessary
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-medium text-emerald-700">
            <Gift className="h-3 w-3" />
            No cap on credits earned
          </span>
        </div>

        {/* CTA */}
        <Link
          href="/earn"
          className="mx-auto flex w-fit items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          Claim your free spin
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
};

const CardSkeleton = () => (
  <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
    <Skeleton className="aspect-[16/10] w-full" />
    <div className="p-3">
      <Skeleton className="mb-2 h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  </div>
);

export const FeaturedProjects: React.FC = () => {
  // Get trending/popular community posts
  const trendingPosts = useQuery(api.community.getTrendingPosts, { limit: 6 });

  // Get user's recent projects (only for signed-in users)
  const userProjects = useQuery(api.project.getUserProjects);

  const isLoadingCommunity = trendingPosts === undefined;
  const isLoadingUserProjects = userProjects === undefined;

  return (
    <div className="relative z-10 mx-auto mt-12 max-w-[816px] px-4">
      {/* Earn Free Credits CTA Section */}
      <EarnCreditsSection />

      {/* Community Featured Projects Section */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            <h3 className="text-base font-semibold text-gray-900">
              Featured by the Community
            </h3>
          </div>
          <Link
            href="/community"
            className="group flex items-center gap-1 text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-700"
          >
            View more
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {isLoadingCommunity ? (
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : trendingPosts && trendingPosts.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {trendingPosts.slice(0, 3).map((post) => (
              <ProjectCardMini
                key={post._id}
                title={post.title}
                description={post.description}
                imageUrl={post.screenshotUrl}
                likesCount={post.likesCount}
                authorName={post.userName}
                href={`/community/project/${post._id}`}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-8 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-[#F9FBFD]">
              <Sparkles className="h-5 w-5 text-[#4285F4]" />
            </div>
            <h4 className="mb-1 text-sm font-medium text-gray-900">
              No featured projects yet
            </h4>
            <p className="text-xs text-gray-500">
              Be the first to share your creation!
            </p>
          </div>
        )}
      </section>

      {/* User's Recent Projects Section - Only show when signed in */}
      <SignedIn>
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <h3 className="text-base font-semibold text-gray-900">
                Your Recent Projects
              </h3>
            </div>
            <Link
              href="/dashboard"
              className="group flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-700"
            >
              View more
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {isLoadingUserProjects ? (
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : userProjects && userProjects.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {userProjects.slice(0, 3).map((project) => (
                <UserProjectCardMini key={project._id} project={project} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-8 text-center">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <FolderOpen className="h-5 w-5 text-blue-500" />
              </div>
              <h4 className="mb-1 text-sm font-medium text-gray-900">
                No projects yet
              </h4>
              <p className="text-xs text-gray-500">
                Start building something amazing above!
              </p>
            </div>
          )}
        </section>
      </SignedIn>
    </div>
  );
};

export default FeaturedProjects;
