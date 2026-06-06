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

interface UserProfileProps {
  userId: Id<"users">;
}

export default function UserProfile({ userId }: UserProfileProps) {
  const [optimisticFollowing, setOptimisticFollowing] = useState(false);

  const profile = useQuery(api.community.getUserProfile, { userId });
  const posts = useQuery(api.community.getUserPosts, { userId, limit: 20 });

  const followUser = useMutation(api.community.followUser);
  const unfollowUser = useMutation(api.community.unfollowUser);

  useEffect(() => {
    if (profile) {
      setOptimisticFollowing(profile.isFollowing);
    }
  }, [profile]);

  const handleFollow = async () => {
    if (!profile) return;
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
        <Skeleton className="mb-6 h-44 w-full rounded-lg bg-muted/35" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-72 rounded-lg bg-muted/35" />
          ))}
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <h2 className="mb-2 text-2xl font-semibold text-foreground">
          User not found
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          This profile does not exist.
        </p>
        <Link
          href="/web/community"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Community
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-20">
      <div className="border-b border-border/50 bg-background">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Link
            href="/web/community"
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Community
          </Link>

          <section className="rounded-lg border border-border/50 bg-muted/15 p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <Avatar className="h-20 w-20 shrink-0 border border-border/60">
                <AvatarImage src={profile.profileImage} />
                <AvatarFallback className="bg-background text-2xl font-semibold text-primary">
                  {profile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                  {profile.name}
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {profile.bio || "No bio yet"}
                </p>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <ProfileStat
                    icon={<Heart className="h-4 w-4 text-rose-400" />}
                    value={profile.totalLikesReceived}
                    label="likes"
                  />
                  <ProfileStat
                    icon={<Users className="h-4 w-4 text-primary" />}
                    value={profile.followersCount}
                    label="followers"
                  />
                  <ProfileStat
                    value={profile.followingCount}
                    label="following"
                  />
                  <ProfileStat
                    icon={<Folder className="h-4 w-4 text-primary" />}
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
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <Settings className="h-4 w-4" />
                    Edit in settings
                  </Link>
                ) : (
                  <Button
                    onClick={handleFollow}
                    className={
                      optimisticFollowing
                        ? "gap-2 border border-border/60 bg-background text-foreground hover:bg-muted"
                        : "gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
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
        <div className="mb-5 flex items-baseline gap-2 border-b border-border/50 pb-3">
          <h2 className="text-base font-semibold text-foreground">Projects</h2>
          <span className="text-sm text-muted-foreground">
            {profile.postsCount}
          </span>
        </div>

        {posts === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-72 rounded-lg bg-muted/35" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-lg border border-border/50 bg-muted/15 px-6 py-12 text-center">
            <h3 className="text-lg font-medium text-foreground">
              {profile.isOwnProfile ? "No published projects" : "No projects"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
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
      <span className="font-medium text-foreground">{value}</span>
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
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/50 bg-background/55 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {icon && <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
