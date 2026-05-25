"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  Globe,
  Twitter,
  Github,
  Heart,
  Users,
  Rocket,
  ArrowLeft,
  ExternalLink,
  UserPlus,
  UserMinus,
  Edit,
  Save,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectCard from "./ProjectCard";
import { CommunityBadge } from "./CommunityBadge";

interface UserProfileProps {
  userId: Id<"users">;
}

export default function UserProfile({ userId }: UserProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [, setIsFollowing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [github, setGithub] = useState("");

  const profile = useQuery(api.community.getUserProfile, { userId });
  const posts = useQuery(api.community.getUserPosts, { userId, limit: 20 });

  const followUser = useMutation(api.community.followUser);
  const unfollowUser = useMutation(api.community.unfollowUser);
  const updateProfile = useMutation(api.community.updateProfile);

  // Sync follow state
  useState(() => {
    if (profile) {
      setIsFollowing(profile.isFollowing);
    }
  });

  const handleFollow = async () => {
    try {
      if (profile?.isFollowing) {
        setIsFollowing(false);
        await unfollowUser({ userId });
        toast.success("Unfollowed");
      } else {
        setIsFollowing(true);
        await followUser({ userId });
        toast.success("Following!");
      }
    } catch (error) {
      setIsFollowing(profile?.isFollowing || false);
      toast.error("Please sign in to follow users");
    }
  };

  const handleStartEdit = () => {
    if (profile) {
      setBio(profile.bio || "");
      setWebsite(profile.website || "");
      setTwitter(profile.twitter || "");
      setGithub(profile.github || "");
    }
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await updateProfile({
        bio: bio || undefined,
        website: website || undefined,
        twitter: twitter || undefined,
        github: github || undefined,
      });
      toast.success("Profile updated!");
      setIsEditing(false);
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  if (profile === undefined) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="mb-6 h-48 w-full rounded-2xl bg-gray-100" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-rose-50">
          <Users className="h-10 w-10 text-rose-500" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">
          User Not Found
        </h2>
        <p className="mb-6 text-gray-500">This profile doesn't exist</p>
        <Link href="/community">
          <Button className="gap-2 bg-violet-600 hover:bg-violet-500">
            <ArrowLeft className="h-4 w-4" />
            Back to Community
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-20">
      {/* Profile Header */}
      <div className="relative">
        {/* Background gradient */}
        <div className="absolute inset-0 h-48 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-transparent" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 pt-12 sm:px-6 lg:px-8">
          {/* Back button */}
          <Link
            href="/community"
            className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Community
          </Link>

          {/* Profile card */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <Avatar className="h-24 w-24 ring-4 ring-violet-100">
                  <AvatarImage src={profile.profileImage} />
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl font-bold text-white">
                    {profile.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {profile.isPaidUser && (
                  <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 ring-2 ring-white">
                    <Rocket className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {profile.name}
                  </h1>
                  {profile.communityBadgeTier &&
                  profile.communityBadgeTier > 0 ? (
                    <CommunityBadge
                      communityBadgeTier={profile.communityBadgeTier}
                      size="md"
                    />
                  ) : profile.isPaidUser ? (
                    <Badge className="border-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white">
                      <Rocket className="mr-1 h-3 w-3" />
                      PRO
                    </Badge>
                  ) : null}
                </div>

                {isEditing ? (
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Write a short bio..."
                    className="mb-3 min-h-20 border-gray-200 bg-white text-gray-900 placeholder:text-gray-400"
                    maxLength={200}
                  />
                ) : (
                  <p className="mb-3 text-gray-600">
                    {profile.bio || "No bio yet"}
                  </p>
                )}

                {/* Stats */}
                <div className="mb-4 flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <Heart className="h-5 w-5 text-rose-500" />
                    <span className="font-medium text-gray-900">
                      {profile.totalLikesReceived}
                    </span>
                    <span className="text-gray-500">likes received</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-violet-500" />
                    <span className="font-medium text-gray-900">
                      {profile.followersCount}
                    </span>
                    <span className="text-gray-500">followers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {profile.followingCount}
                    </span>
                    <span className="text-gray-500">following</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Rocket className="h-5 w-5 text-emerald-500" />
                    <span className="font-medium text-gray-900">
                      {profile.postsCount}
                    </span>
                    <span className="text-gray-500">projects</span>
                  </div>
                </div>

                {/* Social links */}
                {isEditing ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">
                        Website
                      </label>
                      <Input
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://..."
                        className="border-gray-200 bg-white text-sm text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">
                        Twitter
                      </label>
                      <Input
                        value={twitter}
                        onChange={(e) => setTwitter(e.target.value)}
                        placeholder="@username"
                        className="border-gray-200 bg-white text-sm text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">
                        GitHub
                      </label>
                      <Input
                        value={github}
                        onChange={(e) => setGithub(e.target.value)}
                        placeholder="username"
                        className="border-gray-200 bg-white text-sm text-gray-900"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {profile.website && (
                      <a
                        href={profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
                      >
                        <Globe className="h-4 w-4" />
                        Website
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {profile.twitter && (
                      <a
                        href={`https://twitter.com/${profile.twitter.replace("@", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
                      >
                        <Twitter className="h-4 w-4" />
                        {profile.twitter}
                      </a>
                    )}
                    {profile.github && (
                      <a
                        href={`https://github.com/${profile.github}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
                      >
                        <Github className="h-4 w-4" />
                        {profile.github}
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 sm:flex-col">
                {profile.isOwnProfile ? (
                  isEditing ? (
                    <>
                      <Button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        className="gap-2 bg-violet-600 hover:bg-violet-500"
                      >
                        <Save className="h-4 w-4" />
                        {isSaving ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        onClick={() => setIsEditing(false)}
                        variant="outline"
                        className="border-gray-200 text-gray-700 hover:bg-gray-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleStartEdit}
                      variant="outline"
                      className="gap-2 border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      <Edit className="h-4 w-4" />
                      Edit Profile
                    </Button>
                  )
                ) : (
                  <Button
                    onClick={handleFollow}
                    className={
                      profile.isFollowing
                        ? "gap-2 border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                        : "gap-2 bg-violet-600 text-white hover:bg-violet-500"
                    }
                  >
                    {profile.isFollowing ? (
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
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="projects" className="w-full">
          <TabsList className="mb-6 w-full justify-start border-b border-gray-200 bg-transparent p-0">
            <TabsTrigger
              value="projects"
              className="rounded-none border-b-2 border-transparent px-6 pb-3 pt-2 text-gray-500 data-[state=active]:border-violet-500 data-[state=active]:bg-transparent data-[state=active]:text-gray-900"
            >
              Projects ({profile.postsCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="mt-0">
            {posts === undefined ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-72 rounded-2xl bg-gray-100" />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50">
                  <Rocket className="h-8 w-8 text-violet-500" />
                </div>
                <h3 className="mb-2 text-lg font-medium text-gray-900">
                  {profile.isOwnProfile
                    ? "Share your first project"
                    : "No projects yet"}
                </h3>
                <p className="text-sm text-gray-500">
                  {profile.isOwnProfile
                    ? "Launch a project to show it off to the community"
                    : "This user hasn't shared any projects yet"}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {posts.map((post) => (
                  <ProjectCard key={post._id} post={post} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
