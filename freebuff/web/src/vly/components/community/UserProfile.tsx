"use client";

import { useEffect, useState } from "react";
import type React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Folder,
  Github,
  Globe,
  Heart,
  Settings,
  Twitter,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/vly/components/ui/avatar";
import { Button } from "@/vly/components/ui/button";
import { Skeleton } from "@/vly/components/ui/skeleton";
import ProjectCard from "./ProjectCard";
import { useRequireAuth } from "@/vly/components/auth/AuthComponents";
import type {
  CommunityPostCardData,
  CommunityProfileData,
} from "@/vly/lib/community-types";

interface UserProfileProps {
  userId: Id<"users">;
  initialProfile?: CommunityProfileData | null;
  initialPosts?: CommunityPostCardData[];
}

export default function UserProfile({
  userId,
  initialProfile,
  initialPosts = [],
}: UserProfileProps) {
  const [optimisticFollowing, setOptimisticFollowing] = useState(false);
  const { requireAuth } = useRequireAuth();

  const profileQuery = useQuery(api.community.getUserProfile, { userId });
  const postsQuery = useQuery(api.community.getUserPosts, { userId, limit: 20 });
  const profile = profileQuery ?? initialProfile;
  const posts = postsQuery ?? initialPosts;

  const followUser = useMutation(api.community.followUser);
  const unfollowUser = useMutation(api.community.unfollowUser);

  useEffect(() => {
    if (profile) {
      setOptimisticFollowing(profile.isFollowing);
    }
  }, [profile]);

  const handleFollow = async () => {
    if (!profile) return;
    if (!requireAuth()) return;
    try {
      if (optimisticFollowing) {
        setOptimisticFollowing(false);
        await unfollowUser({ userId });
        toast.success("Unfollowed");
      } else {
        setOptimisticFollowing(true);
        await followUser({ userId });
        toast.success("Following");
      }
    } catch {
      setOptimisticFollowing(profile.isFollowing);
      toast.error("Please sign in to follow users");
    }
  };

  if (profile === undefined) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Skeleton className="mb-6 h-44 w-full rounded-2xl bg-white/[0.05]" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-72 rounded-2xl bg-white/[0.05]" />
          ))}
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <h2 className="mb-2 text-2xl font-semibold text-white">
          User not found
        </h2>
        <p className="mb-6 text-sm text-white/55">
          This profile does not exist.
        </p>
        <Link
          href="/web/community"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 text-sm text-white transition-colors hover:bg-white/[0.08]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Community
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-20">
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Link
            href="/web/community"
            className="mb-6 inline-flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Community
          </Link>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <Avatar className="h-20 w-20 shrink-0 border border-white/10">
                <AvatarImage src={profile.profileImage} />
                <AvatarFallback className="bg-white/[0.06] text-2xl font-semibold text-forest-bright">
                  {profile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
                  {profile.name}
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                  {profile.bio || "No bio yet"}
                </p>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/55">
                  <ProfileStat
                    icon={<Heart className="h-4 w-4 text-rose-400" />}
                    value={profile.totalLikesReceived}
                    label="likes"
                  />
                  <ProfileStat
                    icon={<Users className="h-4 w-4 text-forest-bright" />}
                    value={profile.followersCount}
                    label="followers"
                  />
                  <ProfileStat
                    value={profile.followingCount}
                    label="following"
                  />
                  <ProfileStat
                    icon={<Folder className="h-4 w-4 text-forest-bright" />}
                    value={profile.postsCount}
                    label="projects"
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {profile.website && (
                    <ProfileLink href={profile.website} icon={<Globe />}>
                      Website
                    </ProfileLink>
                  )}
                  {profile.twitter && (
                    <ProfileLink
                      href={`https://twitter.com/${profile.twitter.replace("@", "")}`}
                      icon={<Twitter />}
                    >
                      {profile.twitter}
                    </ProfileLink>
                  )}
                  {profile.github && (
                    <ProfileLink
                      href={`https://github.com/${profile.github}`}
                      icon={<Github />}
                    >
                      {profile.github}
                    </ProfileLink>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 gap-2 sm:flex-col">
                {profile.isOwnProfile ? (
                  <Link
                    href="/web/settings"
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 text-sm text-white transition-colors hover:bg-white/[0.08]"
                  >
                    <Settings className="h-4 w-4" />
                    Edit in settings
                  </Link>
                ) : (
                  <Button
                    onClick={handleFollow}
                    className={
                      optimisticFollowing
                        ? "gap-2 rounded-full border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                        : "gap-2 rounded-full bg-forest text-white hover:bg-forest/90"
                    }
                  >
                    {optimisticFollowing ? (
                      <>
                        <UserMinus className="h-4 w-4" />
                        Following
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Follow
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
        <div className="mb-5 flex items-baseline gap-2 border-b border-white/10 pb-3">
          <h2 className="text-base font-semibold text-white">Projects</h2>
          <span className="text-sm text-white/45">
            {profile.postsCount}
          </span>
        </div>

        {postsQuery === undefined && initialPosts.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-72 rounded-2xl bg-white/[0.05]" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
            <h3 className="text-lg font-medium text-white">
              {profile.isOwnProfile ? "No published projects" : "No projects"}
            </h3>
            <p className="mt-2 text-sm text-white/55">
              {profile.isOwnProfile
                ? "Publish a deployed project from the Community page to show it here."
                : "This user has not shared any projects yet."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {posts.map((post) => (
              <ProjectCard key={post._id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileStat({
  icon,
  value,
  label,
}: {
  icon?: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span className="font-medium text-white">{value}</span>
      {label}
    </span>
  );
}

function ProfileLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactElement<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-sm text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      {icon && <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
